# Vendored runtime dependency

`ws/` contains the unmodified npm distribution of **ws 8.21.3**.
Source: https://github.com/websockets/ws
License: MIT; see `ws/LICENSE`.

The exact version and npm integrity hash are recorded in the root package-lock.json.
Vendoring allows `omarchy plugin add` to launch the worker without npm install hooks.
Optional native acceleration modules are not included or required.

To refresh this dependency deliberately:

1. Update the pinned dependency and lockfile.
2. Run `npm ci --ignore-scripts`.
3. Replace `vendor/ws` with the corresponding `node_modules/ws` distribution.
4. Preserve its license and run the test suite.
