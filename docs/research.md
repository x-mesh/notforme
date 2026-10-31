# 조사 자료

조사일: 2026-10-29. 검색 결과와 각 프로젝트의 공개 설명에서 확인한 내용이며, 구현을 열어 보지 않은 것은 설명 그대로 옮겼다.

## 1. 유사 프로젝트

### 1.1 일반 주제·콘텐츠 필터 (같은 영역, 이미 있음)

| 프로젝트 | 설명에서 확인한 내용 | 링크 |
| --- | --- | --- |
| Cloak | AI로 뉴스·주제·콘텐츠를 숨기는 확장. Politics, Clickbait, AI, Entertainment, War & conflicts 등 기본 주제를 켜거나 일반 문장으로 직접 설명. 흐리게·숨기기·밑줄. 모든 사이트에서 동작하고 "right on your device"라고 설명 | https://contentcloak.ai/ |
| Smart Filter | "clickbait", "선거에 대한 글" 같은 규칙을 쓰면 AI가 의미로 판정해 숨김·흐리게·어둡게. 무료. 키워드 방식의 한계를 앞세움 | https://smartfilter.net/ |
| PeaceFeed | 정치·연예·트렌딩 기사를 키워드로 흐리게. 12개 대형 뉴스 사이트 지원, 임의 사이트 설정 가능 | https://chromewebstore.google.com/detail/peacefeed/mhhddlfonglpimgkpkoiolmpoekcegpf |
| Orange Filter | 정치 키워드를 로컬에서 감지해 숨기고 정치 이미지를 흐리게 | https://samsasolutions.com/orangefilter/ |
| NewsFilter | 사용자가 정한 키워드가 든 기사를 "Content Hidden"으로 대체 | https://chromewebstore.google.com/detail/newsfilter-block-what-you/cfmdohbbhknlgpomedlbjkblhakcikkd |
| Apolitical | 정치 콘텐츠를 피드·뉴스에서 숨김(Firefox, 실험적) | https://addons.mozilla.org/en-US/firefox/addon/apolitical-political-filter/ |
| Filter Everything Online | 키워드 그룹·일정·사이트별 예외로 뉴스·소셜·포럼의 주제를 숨김 | https://filter-everything-online.com/ |

### 1.2 LLM으로 피드를 거르는 확장

| 프로젝트 | 설명에서 확인한 내용 | 링크 |
| --- | --- | --- |
| Unslop | LinkedIn·X·Reddit 피드의 AI 생성 글을 LLM이 `keep`/`hide`로 판정. 본인 API 키, Chrome 서비스 워커에서 직접 호출. 구조가 NotForMe와 가장 비슷하다 | https://github.com/sapountzis/Unslop |
| Takeback | 로컬 LLM이 영어 규칙("정치·문화 전쟁 콘텐츠 없음", "클릭베이트 제거" 등)에 따라 Reddit을 실시간으로 거름 | https://www.reddit.com/r/LocalLLaMA/comments/1n770a1/ |
| unbaited | X 피드를 LLM(Groq)으로 거르는 프로토타입 | https://chromewebstore.google.com/detail/unbaited-prototype/bpbnggihcaknipcgbpgjgfhgmdgcokcg |
| HN Filter, Hacker News Filter | Hacker News에서 AI 관련 글을 숨김(키워드) | https://github.com/prashantkhurana/Hacker-News-Filter-AI |

AdGuard도 LLM으로 게시물을 분석해 블러 처리하는 광고 차단 실험을 글로 공개했다(2025-11-18): https://adguard.com/en/blog/beyond-filter-lists-rethinking-ad-blocking-with-llms.html

### 1.3 Jev를 쓰는 인접 프로젝트

| 프로젝트 | 설명에서 확인한 내용 | 링크 |
| --- | --- | --- |
| `dorkitude/skimmer` | Jev로 웹 페이지·파일·목록에서 목표와 관련된 부분만 남기는 Go CLI. 항목마다 yes/no 질문을 일괄 요청. 평가에 쓴 `jev-1.14.0`을 고정해서 `jev-latest` 별칭이 바뀌어도 결과가 달라지지 않게 함. 판정 실패 시 버리지 않고 남김. 기본 기준값 0.5가 측정된 값이고 0.7로 올리면 held-out 42개 목표 중 8개를 잃었다고 보고 | https://github.com/dorkitude/skimmer |

NotForMe와 구조가 겹치는 점은 Jev로 항목별 분류를 한다는 것이고, 브라우저 확장이 아니며 뉴스 목록 전용도 아니다. 이 프로젝트의 평가 방식(질문 형식, 기준값 측정, 모델 고정)은 NotForMe의 정확도 평가 설계에 참고할 만하다.

### 1.4 판단

- 일반 주제 필터는 이미 있고, LLM 방식의 확장도 있다. 새로운 개념이라고 주장하지 않는다.
- 찾은 범위에서는 **뉴스 목록의 광고성 보도자료를 분류해 접는** 확장과 **제품 공개 기사를 따로 거르는** 옵션은 없었다. 다만 전수 조사가 아니고, Cloak·Smart Filter는 사용자가 규칙을 문장으로 직접 쓸 수 있어서 같은 효과를 낼 가능성이 있다(`decisions.md` D-09의 시험 참조).
- 한국어 뉴스 사이트 지원 여부는 각 프로젝트의 설명만으로는 확인하지 못했다.

## 2. 법적 검토

법률 자문이 아니다.

### 2.1 확인한 내용

| 사실 | 출처 |
| --- | --- |
| 2018-04-19 독일 연방대법원이 Axel Springer의 청구를 기각하며 광고 차단 프로그램이 불법이 아니라고 판결했다. 사용 여부는 개발사가 아니라 이용자가 정한다는 점이 고려됐다 | https://www.dw.com/en/top-german-court-permits-use-of-online-ad-blockers-dismissing-axel-springer-claim/a-43459392 , https://www.yna.co.kr/view/AKR20180420168300082 |
| 같은 당사자의 후속 소송에서 Springer는 저작권(컴퓨터 프로그램의 변형)을 주장했다. 하급심은 DOM 등 브라우저가 만드는 임시 데이터 구조는 프로그램 코드가 아니라고 보고 기각했다 | https://www.heise.de/en/news/Axel-Springer-vs-Adblock-Plus-Federal-Court-of-Justice-awaits-ECJ-ruling-9813824.html |
| 2025-07-31 연방대법원(I ZR 131/23)이 하급심 판단을 파기하고 환송했다. 클라이언트 측 처리가 저작권 보호 대상일 수 있다고 볼 여지가 있으나, 변형에 해당하는지에 대한 충분한 사실 인정이 없다고 했다. 최종 판단은 나오지 않았다 | https://www.heise.de/en/news/Copyright-Springer-vs-Adblock-Plus-enters-another-round-10505898.html , https://www.insidetechlaw.com/blog/2025/08/german-federal-court-refers-ad-blocker-case-back-to-hamburg-higher-regional-court |
| 한국저작권위원회가 위 독일 판결을 정리한 자료가 있다 | https://www.copyright.or.kr/information-materials/trend/the-copyright/view.do?brdctsno=54615 |
| 한국의 광고 차단·화면 필터링 판례는 찾지 못했다 | 이번 검색 |

### 2.2 추정

- NotForMe는 서버·코드를 건드리지 않고 로컬 브라우저의 표시만 바꾸고, 기사를 지우지 않고 접는다. 광고 차단보다 침해 소지가 적다고 추정하지만 확인된 결론은 아니다.
- 위험이 커지는 경우: 기사 본문·목록을 서버로 모아 재배포, 유료·로그인 우회, 대량 수집. NotForMe는 이를 하지 않는다.
- 사이트별 이용약관은 확인하지 않았다.

### 2.3 Chrome 웹스토어 (현재는 사용하지 않음)

웹스토어에 올리려면 확장의 전체 로직이 제출한 코드 안에 있어야 하고 원격 코드를 실행할 수 없다. 개인정보 처리방침과 데이터 전송 공개도 필요하다. https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

## 3. 이름 검토

GitHub 저장소 이름 검색(`in:name`) 기준이다. 이 검색은 소유자 이름과도 매칭된다. Chrome 웹스토어, npm, 도메인은 확인하지 않았다.

| 이름 | 결과 | 비고 |
| --- | --- | --- |
| **notforme** | 5건(별 0개, 내용 없음) | 채택. "나를 위한 게 아니야" |
| nobother | 3건(별 0개) | "나를 괴롭히지 마"에 가장 가깝지만 어조가 강함 |
| spareme | 30건(부품 마켓, 메신저 앱) | 관용구라 의미가 흐림 |
| calm-mesh | 0건 | x-mesh 형식이지만 "권리"가 빠짐 |
| filter-mesh | 47건, 모두 3D 메시 필터링 | 이름이 뉘앙스를 담지 못하고 검색이 섞임 |
| chaffoff, newsrinse | 0건 | 뉘앙스 요구 전의 후보 |
| hypeoff, leanfeed | 2건 | 사용 가능하나 채택하지 않음 |
| nopitch, unpitch, pitchoff | 각 1건 | `Nopitch`·`unpitch` 소유자와 겹침 |
| winnow, skimmer | 490건, 439건 | 파서 크레이트와 Jev 기반 CLI(`dorkitude/skimmer`)가 있음 |
| lookaway, myeyes, unbother | 100건, 159건, 59건 | 눈 휴식 앱·프로필 저장소가 많음 |
| calmread | 11건 | "방해 없는 읽기" Chrome 확장이 이미 있음 |
| plainwire, culler, readfree | 11건, 243건, 31건 | 채팅 앱, 일반 단어, 도서 사이트 스크립트가 있음 |

저장소를 만들기 전에 `github.com/x-mesh/notforme`가 비어 있는지 직접 확인할 것.
