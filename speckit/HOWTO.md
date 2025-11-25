# Speckit + Codex Çalıştırma
## Kurulum
1) Specify CLI (Spec Kit):
```
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
# veya tek seferlik:
# uvx --from git+https://github.com/github/spec-kit.git specify init .
```
2) Codex CLI:
```
npm install -g @openai/codex
codex  # ilk çalıştırmada giriş yap
```
## Projeyi Speckit’e bağlama
```
cd <proje_koku>   # bu repo
specify init --here --ai codex
specify check
```
Ardından Codex içinde aşağıdaki slash komutları görünür:
```
/speckit.constitution
/speckit.specify
/speckit.plan
/speckit.tasks
/speckit.implement
```
## Önerilen akış
- `/speckit.constitution` → bu dizindeki CONSTITUTION.md prensiplerini güncelleyin
- `/speckit.specify` → SPEC.md’yi temel alarak “para/ceza yok” şartını vurgulayın
- `/speckit.plan` → PLAN.md’yi tekrar üretin; JS stack
- `/speckit.tasks` → TASKS.md işlerini üretin/güncelleyin
- `/speckit.implement` → değişiklikleri uygulatın
