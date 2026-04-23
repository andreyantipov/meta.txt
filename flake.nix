{
  description = "knol — markdown docs viewer (bun + vite + shadcn)";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.git
          ];

          shellHook = ''
            echo "knol dev shell"
            echo "  bun  $(bun --version)"
            echo "  node $(node --version)"
          '';
        };
      });
}
