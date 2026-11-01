# Changelog

## [0.2.0] - 2026-11-01

### Added

- Add home-page support for Yonhap, Hankyoreh, Kyunghyang Shinmun, Korea Economic Daily, and Dong-A Ilbo.
- Add IT news adapters for Electronic Times, Bloter, Digital Today, TechM, Boan News, Dailysecu, AI Times, Digital Daily, VentureSquare, and Platum.
- Add user overrides that keep or collapse one article URL before the model result.

### Changed

- Filter complete article cards when a verified card selector identifies one article. Fall back to the article link for other layouts.
- Classify articles near the viewport first to reduce initial API requests.
- Preserve Korean topic keywords in model requests and cache keys.
