# ColorTrace source-code review

The Firefox source archive contains the complete ColorTrace pnpm workspace required to reproduce the extension build, including the local `@vcd/color-core` and `@vcd/trace-model` packages.

Prerequisites: Node.js 22+ and pnpm 11.17.0.

From the extracted archive root:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build:firefox`

The resulting unpacked Firefox extension is written to `apps/extension/.output/firefox-mv3`. No environment variables, network services, native components, generated source inputs, or private packages are required to build ColorTrace from the archive.

The repository CI performs the same frozen install and Firefox rebuild from a freshly extracted source ZIP, then compares the rebuilt `firefox-mv3` tree with the normal production build file-for-file and byte-for-byte. Any output drift is treated as a release failure rather than an accepted reproducibility exception.
