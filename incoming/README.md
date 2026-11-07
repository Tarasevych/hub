# SEC-001 — імпорт вихідного коду для аудиту

Ця гілка призначена лише для авторизованого аудиту кібербезпеки. Не зливати її в production без окремого дозволу.

## Як імпортувати останній архів
1. Відкрити теку `incoming/` цієї гілки.
2. Натиснути **Add file → Upload files**.
3. Завантажити точно файл `SEC-001_SOURCE_UPLOAD_20261030.zip` (із пакета, наданого в ChatGPT).
4. Зробити commit **у гілку `audit/sec-001-20261030`**, НЕ в `voornaamst`.
5. У **Actions** відкрити `SEC-001 Import Snapshot` і перевірити успіх.
6. Після імпорту перевірити наявність `backend/`, `src/`, `shared/`, `tests/`, `deploy/`, `package.json`.

Посилання для імпорту коду в агента: https://github.com/Tarasevych/hub/tree/audit/sec-001-20261030

Джерело: архів `mijn-ruimte-20261030-133556.tar.gz`, SHA-256: `e51f819bc0607c596f9b1fdb31e0e6cf227a33c8e8b07b6530b13d0ee36395a4`.

Архів для завантаження ZIP: SHA-256 `8a447a7b68eefe9d752aed335d8573f46aff989a2b834da905a832b13d8131b0`.

Гілка приватного репозиторію. Релізних дій і deployment workflow не запускає.
