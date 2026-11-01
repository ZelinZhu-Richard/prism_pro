# Bundled English dictionaries

Prism serves these files from its loopback backend and loads them into a local web worker. No dictionary service receives document text. NSpell is the spelling engine; this is not a grammar checker.

| Directory | npm source | Upstream dictionary |
| --- | --- | --- |
| `en-US` | [`dictionary-en@4.0.0`](https://www.npmjs.com/package/dictionary-en/v/4.0.0) | SCOWL en_US, version 2020.12.07 |
| `en-GB` | [`dictionary-en-gb@3.0.0`](https://www.npmjs.com/package/dictionary-en-gb/v/3.0.0) | SCOWL en_GB-ise, version 2020.12.07 |

The `index.aff`, `index.dic`, and `license` files are unmodified from the corresponding official npm tarballs. Original license notices are retained in each directory. Package metadata declares `MIT AND BSD`; the full notices govern the bundled data. Source project: [wooorm/dictionaries](https://github.com/wooorm/dictionaries). NSpell's separate MIT notice ships through its npm dependency.

`manifest.json` records file hashes and exact registry tarball URLs. These packages are pinned by vendoring, independently of application package updates. Personal words live in local SQLite settings and do not modify these files. Add proper names and specialist terminology through **Writing checks → Personal dictionary**.
