{
  description = "Development environment for the Bilibili Unlimited History browser extension";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              git
              nodejs_22
              pnpm
              unzip
              zip
            ];

            shellHook = ''
              echo "bilibili-history-wxt development shell"
              echo "Node $(node --version), pnpm $(pnpm --version)"
              echo "Run 'pnpm install --frozen-lockfile', then 'pnpm dev' or 'pnpm dev:firefox'."
            '';
          };
        }
      );
    };
}
