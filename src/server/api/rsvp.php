<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

const ADMIN_PASSWORD_HASH = 'd7c7673ba8ca7b0f04b1af4df026cbea7fed5b8acf59b27d33ef988c60eff054';
const FIRST_AVAILABLE_NUMBER = 7;
const MAX_NAME_LENGTH = 100;

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function validAdminPassword(array $input): bool
{
    $password = (string) ($input['password'] ?? '');
    return hash_equals(ADMIN_PASSWORD_HASH, hash('sha256', $password));
}

function requireAdmin(array $input): void
{
    if (!validAdminPassword($input)) {
        usleep(350000);
        respond(401, ['ok' => false, 'message' => 'La contraseña no es correcta.']);
    }
}

function normalizeName(array $input): string
{
    $name = trim(preg_replace('/\s+/u', ' ', (string) ($input['name'] ?? '')) ?? '');
    if (strlen($name) < 2 || strlen($name) > MAX_NAME_LENGTH) {
        respond(422, ['ok' => false, 'message' => 'Escribe un nombre válido de máximo 100 caracteres.']);
    }
    if (preg_match('/^[=+@-]/', $name)) {
        respond(422, ['ok' => false, 'message' => 'El nombre contiene un carácter inicial no permitido.']);
    }
    return $name;
}

function validateRequestId(array $input): string
{
    $requestId = trim((string) ($input['requestId'] ?? ''));
    if (!preg_match('/^[a-zA-Z0-9-]{8,80}$/', $requestId)) {
        respond(422, ['ok' => false, 'message' => 'No fue posible validar el registro. Recarga la página e intenta otra vez.']);
    }
    return $requestId;
}

function addAttendee(string $csvPath, string $name, string $requestId, ?int $requestedNumber = null): int
{
    $file = fopen($csvPath, 'c+');
    if ($file === false || !flock($file, LOCK_EX)) {
        if (is_resource($file)) fclose($file);
        respond(500, ['ok' => false, 'message' => 'La lista está ocupada. Intenta nuevamente.']);
    }

    $usedNumbers = [];
    $existingNumber = null;
    rewind($file);
    while (($row = fgetcsv($file)) !== false) {
        if (isset($row[0]) && is_numeric($row[0])) {
            $usedNumbers[(int) $row[0]] = true;
        }
        if (isset($row[3]) && hash_equals((string) $row[3], $requestId)) {
            $existingNumber = (int) $row[0];
        }
    }

    if ($existingNumber !== null) {
        flock($file, LOCK_UN);
        fclose($file);
        return $existingNumber;
    }

    if ($requestedNumber !== null && isset($usedNumbers[$requestedNumber])) {
        flock($file, LOCK_UN);
        fclose($file);
        respond(409, ['ok' => false, 'message' => "El número {$requestedNumber} ya está asignado. Elige otro."]);
    }

    $number = $requestedNumber ?? FIRST_AVAILABLE_NUMBER;
    while ($requestedNumber === null && isset($usedNumbers[$number])) {
        $number++;
    }
    date_default_timezone_set('America/Mexico_City');
    fseek($file, 0, SEEK_END);
    if (ftell($file) === 0) {
        fputcsv($file, ['number', 'name', 'confirmed_at', 'request_id']);
    }
    $written = fputcsv($file, [$number, $name, date('Y-m-d H:i:s'), $requestId]);
    fflush($file);
    flock($file, LOCK_UN);
    fclose($file);

    if ($written === false) {
        respond(500, ['ok' => false, 'message' => 'No se pudo guardar el registro. Intenta de nuevo.']);
    }
    return $number;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['ok' => false, 'message' => 'Método no permitido.']);
}

$rawBody = file_get_contents('php://input');
$input = json_decode($rawBody ?: '', true);
if (!is_array($input)) {
    respond(400, ['ok' => false, 'message' => 'Solicitud inválida.']);
}

$dataDirectory = __DIR__ . DIRECTORY_SEPARATOR . 'data';
$csvPath = $dataDirectory . DIRECTORY_SEPARATOR . 'attendees.csv';
if (!is_dir($dataDirectory) && !mkdir($dataDirectory, 0755, true) && !is_dir($dataDirectory)) {
    respond(500, ['ok' => false, 'message' => 'No se pudo preparar el registro de asistentes.']);
}

$action = isset($input['action']) ? (string) $input['action'] : '';

if ($action === 'health') {
    if (!is_writable($dataDirectory)) {
        respond(503, ['ok' => false, 'message' => 'El almacenamiento no tiene permisos de escritura.']);
    }
    respond(200, ['ok' => true]);
}

if ($action === 'confirm') {
    $number = addAttendee($csvPath, normalizeName($input), validateRequestId($input));
    respond(201, ['ok' => true, 'number' => $number]);
}

if ($action === 'manual-add') {
    requireAdmin($input);
    $requestedNumber = filter_var($input['number'] ?? null, FILTER_VALIDATE_INT);
    if ($requestedNumber === false || $requestedNumber < 1) {
        respond(422, ['ok' => false, 'message' => 'Escribe un número de participante válido.']);
    }
    $number = addAttendee($csvPath, normalizeName($input), validateRequestId($input), $requestedNumber);
    respond(201, ['ok' => true, 'number' => $number]);
}

if ($action === 'reorder') {
    requireAdmin($input);
    $order = $input['order'] ?? null;
    if (!is_array($order)) {
        respond(422, ['ok' => false, 'message' => 'El orden recibido no es válido.']);
    }

    $file = fopen($csvPath, 'c+');
    if ($file === false || !flock($file, LOCK_EX)) {
        if (is_resource($file)) fclose($file);
        respond(500, ['ok' => false, 'message' => 'La lista está ocupada. Intenta nuevamente.']);
    }

    $rowsByNumber = [];
    rewind($file);
    while (($row = fgetcsv($file)) !== false) {
        if (!isset($row[0]) || !is_numeric($row[0])) continue;
        $rowsByNumber[(int) $row[0]] = $row;
    }

    $requestedOrder = [];
    foreach ($order as $value) {
        $number = filter_var($value, FILTER_VALIDATE_INT);
        if ($number === false || !isset($rowsByNumber[$number]) || isset($requestedOrder[$number])) {
            flock($file, LOCK_UN);
            fclose($file);
            respond(409, ['ok' => false, 'message' => 'La lista cambió. Actualízala antes de guardar el orden.']);
        }
        $requestedOrder[$number] = true;
    }

    if (count($requestedOrder) !== count($rowsByNumber)) {
        flock($file, LOCK_UN);
        fclose($file);
        respond(409, ['ok' => false, 'message' => 'La lista cambió. Actualízala antes de guardar el orden.']);
    }

    $availableNumbers = array_keys($rowsByNumber);
    sort($availableNumbers, SORT_NUMERIC);
    $reorderedRows = [];
    foreach (array_keys($requestedOrder) as $index => $oldNumber) {
        $row = $rowsByNumber[$oldNumber];
        $row[0] = (string) $availableNumbers[$index];
        $reorderedRows[] = $row;
    }

    rewind($file);
    ftruncate($file, 0);
    fputcsv($file, ['number', 'name', 'confirmed_at', 'request_id']);
    foreach ($reorderedRows as $row) {
        fputcsv($file, $row);
    }
    fflush($file);
    flock($file, LOCK_UN);
    fclose($file);
    respond(200, ['ok' => true]);
}

if ($action === 'delete') {
    requireAdmin($input);
    $number = filter_var($input['number'] ?? null, FILTER_VALIDATE_INT);
    if ($number === false || $number < 1) {
        respond(422, ['ok' => false, 'message' => 'El número de participante no es válido.']);
    }

    $file = fopen($csvPath, 'c+');
    if ($file === false || !flock($file, LOCK_EX)) {
        if (is_resource($file)) fclose($file);
        respond(500, ['ok' => false, 'message' => 'La lista está ocupada. Intenta nuevamente.']);
    }

    $remainingRows = [];
    $found = false;
    rewind($file);
    while (($row = fgetcsv($file)) !== false) {
        if (!isset($row[0]) || !is_numeric($row[0])) continue;
        if ((int) $row[0] === $number) {
            $found = true;
            continue;
        }
        $remainingRows[] = $row;
    }

    if (!$found) {
        flock($file, LOCK_UN);
        fclose($file);
        respond(404, ['ok' => false, 'message' => 'El registro ya no existe.']);
    }

    rewind($file);
    ftruncate($file, 0);
    fputcsv($file, ['number', 'name', 'confirmed_at', 'request_id']);
    foreach ($remainingRows as $row) {
        fputcsv($file, $row);
    }
    fflush($file);
    flock($file, LOCK_UN);
    fclose($file);
    respond(200, ['ok' => true]);
}

if ($action === 'list') {
    requireAdmin($input);
    $attendees = [];
    if (is_file($csvPath)) {
        $file = fopen($csvPath, 'r');
        if ($file === false || !flock($file, LOCK_SH)) {
            if (is_resource($file)) fclose($file);
            respond(500, ['ok' => false, 'message' => 'No fue posible abrir la lista.']);
        }
        while (($row = fgetcsv($file)) !== false) {
            if (!isset($row[0]) || !is_numeric($row[0])) continue;
            $date = isset($row[2]) ? DateTime::createFromFormat('Y-m-d H:i:s', $row[2]) : false;
            $attendees[] = [
                'number' => (int) $row[0],
                'name' => (string) ($row[1] ?? ''),
                'confirmedAt' => $date ? $date->format('d/m/Y · H:i') : (string) ($row[2] ?? '')
            ];
        }
        flock($file, LOCK_UN);
        fclose($file);
    }
    usort($attendees, static fn(array $a, array $b): int => $a['number'] <=> $b['number']);
    respond(200, ['ok' => true, 'attendees' => $attendees]);
}

respond(400, ['ok' => false, 'message' => 'Acción no reconocida.']);
