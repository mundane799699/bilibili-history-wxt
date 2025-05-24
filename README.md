# Bilibili 无限历史记录浏览器插件源代码

## 官网

[bilibilihistory.com](https://bilibilihistory.com/)

## 插件地址

[chrome](https://chromewebstore.google.com/detail/bilibili-%E6%97%A0%E9%99%90%E5%8E%86%E5%8F%B2%E8%AE%B0%E5%BD%95/cfloggaggkeocfoflejkmhdhbehjojga?hl=zh)  
[edge](https://microsoftedge.microsoft.com/addons/detail/ekdaecpdimflnhalemibjjjdfoplnbna)  
[firefox](https://addons.mozilla.org/zh-CN/firefox/addon/bilibili-%E6%97%A0%E9%99%90%E5%8E%86%E5%8F%B2%E8%AE%B0%E5%BD%95/)

## 技术栈

1. [wxt](https://wxt.dev/)
2. react
3. [tailwindcss](https://tailwindcss.com/)

## 本地调试

1. 安装 node.js
2. 安装 pnpm

```
npm install -g pnpm
```

3. 本地启动

```
pnpm install
pnpm dev
```

4. 加载扩展
   - chrome 浏览器打开 chrome://extensions/
   - 加载已解压的扩展程序
   - 打开./output/chrome-mv3-dev

## 使用方法

```
1. 登录b站网页版
2. 安装扩展后，点击扩展图标
3. 首次点击立即同步按钮会全量同步你的 Bilibili 观看历史
4. 同步完成后，点击打开历史记录页面按钮，即可查看历史记录
5. 可以使用搜索框搜索特定的历史记录
6. 向下滚动可以加载更多历史记录
```

## 参与开发

欢迎各位开发者贡献代码，让这个插件变得更好用。  
目前积压的需求有很多，因为我本人时间有限，但是又不想让这个项目的更新停滞，所以将代码开源。

可以加我微信，拉你进入开发者交流群， 请备注**参与开发**。
<img src="https://cdn.mundane.ink/202402032206594.png" width="200" height="200" alt="qrcode">
