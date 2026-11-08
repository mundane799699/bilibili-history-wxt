/**
 * 纯 JS 的 fMP4 合流器：把 B 站 DASH 的视频 m4s 和音频 m4s 合成为一个带音视频双轨的 MP4。
 *
 * B 站 DASH 流都是 fragmented MP4：ftyp + moov(含 mvex) + sidx + N × (moof + mdat)。
 * 合流只需要：
 *   1. 重建 moov：视频 mvhd + 视频 trak + 音频 trak + mvex(两个 trex)；
 *   2. 把两路的 moof/mdat 片段按时间交错排列，并改写 mfhd 序号、tfhd 轨道号；
 *   3. 丢弃 sidx（它只描述单轨的字节偏移，合流后失效，且是可选的）。
 *
 * 不重编码、不依赖 ffmpeg.wasm。mdat 直接复用输入 Blob 的切片，不会把整段视频读进 JS 堆，
 * 所以 GB 级视频也只占用很少内存。
 */

interface BoxRef {
  type: string;
  start: number;
  size: number;
}

interface TrackInfo {
  trackId: number;
  timescale: number;
  /** 单轨 moov 中 mvhd 的时长，单位为该文件 mvhd 的 timescale */
  movieDuration: number;
  movieTimescale: number;
  ftyp: Uint8Array;
  mvhd: Uint8Array;
  trak: Uint8Array;
  trex: Uint8Array;
  mehd: Uint8Array | null;
}

interface Fragment {
  blob: Blob;
  moof: Uint8Array;
  moofStart: number;
  payloadStart: number;
  payloadEnd: number;
  /** 片段起始时间（秒），用于交错排序 */
  time: number;
  isAudio: boolean;
}

const HEADER_PROBE = 16;

const readBytes = async (blob: Blob, start: number, end: number) =>
  new Uint8Array(await blob.slice(start, end).arrayBuffer());

const fourcc = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const readUint64 = (dv: DataView, offset: number) =>
  dv.getUint32(offset) * 2 ** 32 + dv.getUint32(offset + 4);

const writeUint64 = (dv: DataView, offset: number, value: number) => {
  dv.setUint32(offset, Math.floor(value / 2 ** 32));
  dv.setUint32(offset + 4, value >>> 0);
};

/** 读取 Blob 顶层 box 列表（只读每个 box 的头部） */
const listTopLevelBoxes = async (blob: Blob): Promise<BoxRef[]> => {
  const boxes: BoxRef[] = [];
  let offset = 0;
  while (offset + 8 <= blob.size) {
    const header = await readBytes(blob, offset, Math.min(offset + HEADER_PROBE, blob.size));
    const dv = view(header);
    let size = dv.getUint32(0);
    const type = fourcc(header, 4);
    if (size === 1) {
      if (header.length < 16) throw new Error(`MP4 结构异常：${type} 头部不完整`);
      size = readUint64(dv, 8);
    } else if (size === 0) {
      size = blob.size - offset;
    }
    if (size < 8 || offset + size > blob.size) {
      throw new Error(`MP4 结构异常：${type} box 越界（offset=${offset}, size=${size}）`);
    }
    boxes.push({ type, start: offset, size });
    offset += size;
  }
  return boxes;
};

/** 在内存中的 box 数据里遍历直接子 box */
const listChildren = (bytes: Uint8Array, start: number, end: number): BoxRef[] => {
  const children: BoxRef[] = [];
  const dv = view(bytes);
  let offset = start;
  while (offset + 8 <= end) {
    let size = dv.getUint32(offset);
    let headerSize = 8;
    if (size === 1) {
      size = readUint64(dv, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) break;
    children.push({ type: fourcc(bytes, offset + 4), start: offset, size });
    offset += size;
  }
  return children;
};

const findChild = (bytes: Uint8Array, parent: BoxRef, type: string) =>
  listChildren(bytes, parent.start + 8, parent.start + parent.size).find((b) => b.type === type);

const findPath = (bytes: Uint8Array, root: BoxRef, path: string[]): BoxRef | undefined => {
  let current: BoxRef | undefined = root;
  for (const type of path) {
    if (!current) return undefined;
    current = findChild(bytes, current, type);
  }
  return current;
};

const sliceBox = (bytes: Uint8Array, box: BoxRef) => bytes.slice(box.start, box.start + box.size);

const makeBox = (type: string, payloads: Uint8Array[]) => {
  const size = 8 + payloads.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(size);
  const dv = view(out);
  dv.setUint32(0, size);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  let offset = 8;
  for (const p of payloads) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

const makeFtyp = () => {
  const brands = ["isom", "iso2", "iso5", "iso6", "mp41"];
  const payload = new Uint8Array(8 + brands.length * 4);
  const dv = view(payload);
  for (let i = 0; i < 4; i++) payload[i] = "isom".charCodeAt(i);
  dv.setUint32(4, 512);
  brands.forEach((brand, idx) => {
    for (let i = 0; i < 4; i++) payload[8 + idx * 4 + i] = brand.charCodeAt(i);
  });
  return makeBox("ftyp", [payload]);
};

/** 解析单轨 fMP4 的初始化段（ftyp + moov） */
const parseInit = async (blob: Blob, boxes: BoxRef[], label: string): Promise<TrackInfo> => {
  const ftypRef = boxes.find((b) => b.type === "ftyp");
  const moovRef = boxes.find((b) => b.type === "moov");
  if (!moovRef) throw new Error(`${label}流缺少 moov，可能不是 DASH 分片格式`);

  const ftyp = ftypRef
    ? await readBytes(blob, ftypRef.start, ftypRef.start + ftypRef.size)
    : makeFtyp();
  const moov = await readBytes(blob, moovRef.start, moovRef.start + moovRef.size);
  const root: BoxRef = { type: "moov", start: 0, size: moov.length };

  const mvhdRef = findChild(moov, root, "mvhd");
  const trakRefs = listChildren(moov, 8, moov.length).filter((b) => b.type === "trak");
  const mvexRef = findChild(moov, root, "mvex");
  if (!mvhdRef || trakRefs.length !== 1 || !mvexRef) {
    throw new Error(`${label}流的 moov 结构不受支持（需要单轨 fMP4）`);
  }
  const trakRef = trakRefs[0];
  const tkhdRef = findChild(moov, trakRef, "tkhd");
  const mdhdRef = findPath(moov, trakRef, ["mdia", "mdhd"]);
  const trexRef = findChild(moov, mvexRef, "trex");
  const mehdRef = findChild(moov, mvexRef, "mehd");
  if (!tkhdRef || !mdhdRef || !trexRef) throw new Error(`${label}流缺少 tkhd/mdhd/trex`);

  const dv = view(moov);
  const tkhdVersion = moov[tkhdRef.start + 8];
  const trackId = dv.getUint32(tkhdRef.start + 12 + (tkhdVersion === 1 ? 16 : 8));

  const mdhdVersion = moov[mdhdRef.start + 8];
  const timescale = dv.getUint32(mdhdRef.start + 12 + (mdhdVersion === 1 ? 16 : 8));

  const mvhdVersion = moov[mvhdRef.start + 8];
  const mvhdTsOffset = mvhdRef.start + 12 + (mvhdVersion === 1 ? 16 : 8);
  const movieTimescale = dv.getUint32(mvhdTsOffset);
  const movieDuration =
    mvhdVersion === 1 ? readUint64(dv, mvhdTsOffset + 4) : dv.getUint32(mvhdTsOffset + 4);

  return {
    trackId,
    timescale,
    movieDuration,
    movieTimescale,
    ftyp,
    mvhd: sliceBox(moov, mvhdRef),
    trak: sliceBox(moov, trakRef),
    trex: sliceBox(moov, trexRef),
    mehd: mehdRef ? sliceBox(moov, mehdRef) : null,
  };
};

/** 读出所有 moof，并确定每个片段的负载范围（moof 之后到最后一个 mdat 结束） */
const collectFragments = async (
  blob: Blob,
  boxes: BoxRef[],
  timescale: number,
  isAudio: boolean,
): Promise<Fragment[]> => {
  const fragments: Fragment[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (box.type !== "moof") continue;
    let payloadEnd = box.start + box.size;
    for (let j = i + 1; j < boxes.length && boxes[j].type !== "moof"; j++) {
      if (boxes[j].type === "mdat") payloadEnd = boxes[j].start + boxes[j].size;
    }
    const moof = await readBytes(blob, box.start, box.start + box.size);
    const root: BoxRef = { type: "moof", start: 0, size: moof.length };
    const tfdt = findPath(moof, root, ["traf", "tfdt"]);
    let decodeTime = 0;
    if (tfdt) {
      const dv = view(moof);
      decodeTime =
        moof[tfdt.start + 8] === 1
          ? readUint64(dv, tfdt.start + 12)
          : dv.getUint32(tfdt.start + 12);
    }
    fragments.push({
      blob,
      moof,
      moofStart: box.start,
      payloadStart: box.start + box.size,
      payloadEnd,
      time: decodeTime / timescale,
      isAudio,
    });
  }
  if (fragments.length === 0) throw new Error(`${isAudio ? "音频" : "视频"}流中没有找到媒体分片`);
  return fragments;
};

const setTkhdTrackId = (trak: Uint8Array, trackId: number) => {
  const tkhd = findChild(trak, { type: "trak", start: 0, size: trak.length }, "tkhd");
  if (!tkhd) return;
  const version = trak[tkhd.start + 8];
  view(trak).setUint32(tkhd.start + 12 + (version === 1 ? 16 : 8), trackId);
};

/**
 * 改写 moof：mfhd 序号、tfhd 轨道号；若 tfhd 带绝对 base_data_offset，按新位置平移。
 */
const patchMoof = (
  fragment: Fragment,
  sequence: number,
  trackId: number | null,
  newMoofStart: number,
) => {
  const moof = fragment.moof.slice();
  const dv = view(moof);
  const root: BoxRef = { type: "moof", start: 0, size: moof.length };
  const mfhd = findChild(moof, root, "mfhd");
  if (mfhd) dv.setUint32(mfhd.start + 12, sequence);

  for (const traf of listChildren(moof, 8, moof.length).filter((b) => b.type === "traf")) {
    const tfhd = findChild(moof, traf, "tfhd");
    if (!tfhd) continue;
    const flags = dv.getUint32(tfhd.start + 8) & 0xffffff;
    if (trackId !== null) dv.setUint32(tfhd.start + 12, trackId);
    if (flags & 0x000001) {
      const oldBase = readUint64(dv, tfhd.start + 16);
      writeUint64(dv, tfhd.start + 16, oldBase - fragment.moofStart + newMoofStart);
    }
  }
  return moof;
};

export interface MuxResult {
  blob: Blob;
  durationSeconds: number;
}

/**
 * 合成视频 + 音频为单个 MP4（fragmented）。
 * @param videoBlob B 站 DASH 视频流（m4s）
 * @param audioBlob B 站 DASH 音频流（m4s），可为 null（无音轨视频）
 */
export async function muxDashToMp4(videoBlob: Blob, audioBlob: Blob | null): Promise<MuxResult> {
  const videoBoxes = await listTopLevelBoxes(videoBlob);
  const video = await parseInit(videoBlob, videoBoxes, "视频");
  const videoFragments = await collectFragments(videoBlob, videoBoxes, video.timescale, false);

  let audio: TrackInfo | null = null;
  let audioFragments: Fragment[] = [];
  if (audioBlob) {
    const audioBoxes = await listTopLevelBoxes(audioBlob);
    audio = await parseInit(audioBlob, audioBoxes, "音频");
    audioFragments = await collectFragments(audioBlob, audioBoxes, audio.timescale, true);
  }

  const videoTrackId = video.trackId;
  const audioTrackId = audio
    ? audio.trackId === videoTrackId
      ? videoTrackId + 1
      : audio.trackId
    : null;
  const remapAudio = audio !== null && audioTrackId !== audio.trackId;

  // ---- 重建 moov ----
  const movieTimescale = video.movieTimescale;
  const videoDuration = video.movieDuration;
  const audioDuration = audio
    ? Math.round((audio.movieDuration / audio.movieTimescale) * movieTimescale)
    : 0;
  const totalDuration = Math.max(videoDuration, audioDuration);

  const mvhd = video.mvhd.slice();
  {
    const dv = view(mvhd);
    const version = mvhd[8];
    const tsOffset = 12 + (version === 1 ? 16 : 8);
    if (version === 1) writeUint64(dv, tsOffset + 4, totalDuration);
    else dv.setUint32(tsOffset + 4, totalDuration);
    dv.setUint32(mvhd.length - 4, Math.max(videoTrackId, audioTrackId ?? 0) + 1);
  }

  const mvexChildren: Uint8Array[] = [];
  if (video.mehd) {
    const mehd = video.mehd.slice();
    const dv = view(mehd);
    if (mehd[8] === 1) writeUint64(dv, 12, totalDuration);
    else dv.setUint32(12, totalDuration);
    mvexChildren.push(mehd);
  }
  mvexChildren.push(video.trex);

  const traks = [video.trak];
  if (audio && audioTrackId !== null) {
    const audioTrak = audio.trak.slice();
    const audioTrex = audio.trex.slice();
    if (remapAudio) {
      setTkhdTrackId(audioTrak, audioTrackId);
      view(audioTrex).setUint32(12, audioTrackId);
    }
    traks.push(audioTrak);
    mvexChildren.push(audioTrex);
  }

  const moov = makeBox("moov", [mvhd, ...traks, makeBox("mvex", mvexChildren)]);
  const ftyp = makeFtyp();

  // ---- 交错片段 ----
  const ordered: Fragment[] = [];
  let vi = 0;
  let ai = 0;
  while (vi < videoFragments.length || ai < audioFragments.length) {
    const v = videoFragments[vi];
    const a = audioFragments[ai];
    if (v && (!a || v.time <= a.time)) {
      ordered.push(v);
      vi++;
    } else {
      ordered.push(a);
      ai++;
    }
  }

  const parts: BlobPart[] = [ftyp, moov];
  let position = ftyp.length + moov.length;
  ordered.forEach((fragment, index) => {
    const trackId = fragment.isAudio ? (remapAudio ? audioTrackId : null) : null;
    const moof = patchMoof(fragment, index + 1, trackId, position);
    parts.push(moof);
    parts.push(fragment.blob.slice(fragment.payloadStart, fragment.payloadEnd));
    position += moof.length + (fragment.payloadEnd - fragment.payloadStart);
  });

  return {
    blob: new Blob(parts, { type: "video/mp4" }),
    durationSeconds: totalDuration / movieTimescale,
  };
}
