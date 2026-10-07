<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');

$application = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'index.html';
if (!is_file($application)) {
    http_response_code(500);
    echo 'No fue posible cargar la administración.';
    exit;
}

$html = file_get_contents($application);
if ($html === false) {
    http_response_code(500);
    echo 'No fue posible cargar la administración.';
    exit;
}

// adminList vive un nivel debajo de la invitación. Esta base conserva las
// rutas de Angular, los assets y la API aun cuando IONOS use una subcarpeta.
echo str_replace('<head>', '<head><base href="../">', $html);
