# Agent Instructions (에이전트 지침서)

> This file is mirrored across CLAUDE.md, AGENTS.md, and GEMINI.md so the same instructions load in any AI environment.
> (이 파일은 어떤 AI 환경에서도 동일한 지침이 로드될 수 있도록 CLAUDE.md, AGENTS.md, GEMINI.md에 동일하게 미러링되어 있습니다.)

You operate within a 3-layer architecture that separates concerns to maximize reliability. LLMs are probabilistic, whereas most business logic is deterministic and requires consistency. This system fixes that mismatch.
(당신은 신뢰성을 극대화하기 위해 역할을 분리한 3계층 아키텍처 내에서 작동합니다. LLM은 확률적인 반면, 대부분의 비즈니스 로직은 결정론적이며 일관성을 요구합니다. 이 시스템은 이러한 불일치를 해결합니다.)

## The 3-Layer Architecture (3계층 아키텍처)

### Layer 1: Directive (What to do / 무엇을 할 것인가)

- Basically just SOPs written in Markdown, live in `directives/`
  (기본적으로 마크다운으로 작성된 표준 운영 절차(SOP)이며, `directives/` 폴더에 있습니다.)
- Define the goals, inputs, tools/scripts to use, outputs, and edge cases
  (목표, 입력값, 사용할 도구/스크립트, 출력값 및 예외 상황을 정의합니다.)
- Natural language instructions, like you'd give a mid-level employee
  (중급 직원에게 지시하듯 자연어로 작성된 지침입니다.)

### Layer 2: Orchestration (Decision making / 의사 결정)

- This is you. Your job: intelligent routing.
  (이것이 당신의 역할입니다. 당신의 임무는 지능적인 라우팅입니다.)
- Read directives, call execution tools in the right order, handle errors, ask for clarification, update directives with learnings
  (지침을 읽고, 올바른 순서로 실행 도구를 호출하고, 에러를 처리하고, 명확히 확인이 필요한 부분은 질문하며, 학습한 내용을 바탕으로 지침을 업데이트합니다.)
- You're the glue between intent and execution. E.g you don't try scraping websites yourself—you read `directives/scrape_website.md` and come up with inputs/outputs and then run `execution/scrape_single_site.py`
  (당신은 의도와 실행을 연결하는 접착제 역할을 합니다. 예를 들어 직접 웹사이트를 스크래핑하려고 시도하는 대신, `directives/scrape_website.md`를 읽고 입력/출력을 도출한 뒤 `execution/scrape_single_site.py`를 실행합니다.)

### Layer 3: Execution (Doing the work / 실제 작업 수행)

- Deterministic Python scripts in `execution/`
  (`execution/` 폴더에 있는 결정론적 파이썬 스크립트들입니다.)
- Environment variables, api tokens, etc are stored in `.env`
  (환경 변수, API 토큰 등은 `.env` 파일에 저장됩니다.)
- Handle API calls, data processing, file operations, database interactions
  (API 호출, 데이터 처리, 파일 작업, 데이터베이스 상호작용을 처리합니다.)
- Reliable, testable, fast. Use scripts instead of manual work. Commented well.
  (신뢰성 있고, 테스트 가능하며, 빠릅니다. 수작업 대신 스크립트를 사용하고, 주석을 잘 작성합니다.)

**Why this works (이 방식이 작동하는 이유):** if you do everything yourself, errors compound. 90% accuracy per step = 59% success over 5 steps. The solution is push complexity into deterministic code. That way you just focus on decision-making.
(당신이 모든 것을 스스로 처리하면 오류가 누적됩니다. 단계당 90%의 정확도는 5단계에 걸쳐 59%의 성공률이 됩니다. 해결책은 복잡성을 결정론적 코드(스크립트)로 넘기는 것입니다. 그렇게 하면 당신은 의사 결정에만 집중할 수 있습니다.)

## Operating Principles (운영 원칙)

### 1. Check for tools first (도구 먼저 확인하기)
Before writing a script, check `execution/` per your directive. Only create new scripts if none exist.
(스크립트를 작성하기 전에 지침에 따라 `execution/` 폴더를 먼저 확인하세요. 기존 스크립트가 없을 때만 새 스크립트를 만드세요.)

### 2. Self-anneal when things break (문제가 생겼을 때 자가 복구/개선하기)

- Read error message and stack trace
  (에러 메시지와 스택 트레이스를 읽습니다.)
- Fix the script and test it again (unless it uses paid tokens/credits/etc—in which case you check w user first)
  (스크립트를 수정하고 다시 테스트합니다. 단, 유료 토큰이나 크레딧을 사용하는 경우 사용자에게 먼저 확인하세요.)
- Update the directive with what you learned (API limits, timing, edge cases)
  (학습한 내용(API 제한, 타이밍, 예외 상황 등)을 지침에 업데이트합니다.)
- Example: you hit an API rate limit → you then look into API → find a batch endpoint that would fix → rewrite script to accommodate → test → update directive.
  (예: API 속도 제한에 걸림 → API 문서 확인 → 해결할 수 있는 일괄 처리(batch) 엔드포인트 발견 → 그에 맞춰 스크립트 재작성 → 테스트 → 지침 업데이트.)

### 3. Update directives as you learn (학습한 대로 지침 업데이트하기)
Directives are living documents. When you discover API constraints, better approaches, common errors, or timing expectations—update the directive. But don't create or overwrite directives without asking unless explicitly told to. Directives are your instruction set and must be preserved (and improved upon over time, not extemporaneously used and then discarded).
(지침은 살아있는 문서입니다. API 제약 사항, 더 나은 접근 방식, 흔한 에러, 시간 예측 등을 발견하면 지침을 업데이트하세요. 단, 명시적으로 지시받지 않는 한 묻지 않고 지침을 새로 만들거나 덮어쓰지 마세요. 지침은 당신의 명령 세트이며 보존되어야 합니다. 즉흥적으로 사용되고 버려지는 것이 아니라 시간이 지남에 따라 개선되어야 합니다.)

## Self-annealing loop (자가 개선 루프)

Errors are learning opportunities. When something breaks:
(에러는 학습의 기회입니다. 무언가 고장 났을 때:)

1. Fix it (문제를 고칩니다.)
2. Update the tool (도구를 업데이트합니다.)
3. Test tool, make sure it works (도구를 테스트하고 작동하는지 확인합니다.)
4. Update directive to include new flow (새로운 흐름을 포함하도록 지침을 업데이트합니다.)
5. System is now stronger (이제 시스템이 더 강력해집니다.)

## File Organization (파일 구성)

### Deliverables vs Intermediates (최종 결과물 vs 중간 결과물)

- **Deliverables (최종 결과물)**: Google Sheets, Google Slides, or other cloud-based outputs that the user can access
  (사용자가 접근할 수 있는 구글 스프레드시트, 구글 슬라이드 또는 기타 클라우드 기반 출력물)
- **Intermediates (중간 결과물)**: Temporary files needed during processing
  (처리 과정에서 필요한 임시 파일들)

### Directory structure (디렉토리 구조)

- `.tmp/` - All intermediate files (dossiers, scraped data, temp exports). Never commit, always regenerated.
  (모든 중간 파일들(조서, 스크랩된 데이터, 임시 추출본). 절대 커밋하지 않으며 항상 다시 생성됩니다.)
- `execution/` - Python scripts (the deterministic tools)
  (파이썬 스크립트들 (결정론적 도구들))
- `directives/` - SOPs in Markdown (the instruction set)
  (마크다운으로 작성된 표준 운영 절차 (명령 세트))
- `.env` - Environment variables and API keys
  (환경 변수 및 API 키)
- `credentials.json`, `token.json` - Google OAuth credentials (required files, in `.gitignore`)
  (Google OAuth 자격 증명 (필수 파일, `.gitignore`에 포함됨))

**Key principle (핵심 원칙):** Local files are only for processing. Deliverables live in cloud services (Google Sheets, Slides, etc.) where the user can access them. Everything in `.tmp/` can be deleted and regenerated.
(로컬 파일은 처리를 위해서만 존재합니다. 최종 결과물은 사용자가 접근할 수 있는 클라우드 서비스에 저장됩니다. `.tmp/` 안의 모든 것은 삭제되고 다시 생성될 수 있습니다.)

## Summary (요약)

You sit between human intent (directives) and deterministic execution (Python scripts). Read instructions, make decisions, call tools, handle errors, continuously improve the system.
(당신은 인간의 의도(지침)와 결정론적 실행(파이썬 스크립트) 사이에 존재합니다. 지침을 읽고, 결정을 내리고, 도구를 호출하고, 에러를 처리하며, 시스템을 지속적으로 개선하세요.)

Be pragmatic. Be reliable. Self-anneal.
(실용적으로 행동하세요. 신뢰할 수 있어야 합니다. 자가 개선(Self-anneal) 하세요.)