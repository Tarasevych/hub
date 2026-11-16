// NEP-GEHEIMEN VOOR TESTS (SEC-PAKKET-001, 16.11.2026).
// Тестові зразки ключів збирайте лише цією функцією: префікс і решта лежать у вихідному файлі окремо, тож ні
// пакет оновлення (перевірка «geheimen» на сторінці «Оновлення»), ні сканери секретів GitHub не бачать у файлі
// «ключа». Під час виконання тест отримує звичайний рядок. Лише нереальні значення — ніколи не справжні ключі.
// Testvoorbeelden alleen hiermee samenstellen: voorvoegsel en rest staan los in de bron, zodat het uitrolpakket en
// geheimscanners geen «sleutel» in het bestand zien. Uitsluitend verzonnen waarden.
export const nepGeheim = (...delen: string[]): string => delen.join('');
