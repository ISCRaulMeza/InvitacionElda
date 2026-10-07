# Birthday Run 2027

Invitaci&oacute;n digital responsive para la carrera de cumplea&ntilde;os de Elda Meza, desarrollada con Angular y Bootstrap.

## Desarrollo local

Requiere Node.js 20 o superior.

```bash
npm ci
npm start
```

La aplicaci&oacute;n estar&aacute; disponible en `http://localhost:4200`.

## Build de producci&oacute;n

```bash
npm run build
```

El resultado se genera en `dist/birthday-run/browser`.

## Integraci&oacute;n continua

El workflow de GitHub Actions ejecuta en cada push y pull request hacia `main`:

1. Instalaci&oacute;n reproducible mediante `npm ci`.
2. Compilaci&oacute;n de producci&oacute;n de Angular.
3. Publicaci&oacute;n del build como artefacto descargable durante 14 d&iacute;as.

El workflow de despliegue compila la aplicaci&oacute;n y publica el resultado por SFTP en IONOS despu&eacute;s de cada push a `main`. Las credenciales y la URL p&uacute;blica se administran como secretos del entorno `invitaciones`.

## Confirmaciones de asistencia

La API PHP en `src/server/api/rsvp.php` guarda las confirmaciones en un CSV compartido dentro del servidor. Los n&uacute;meros 1 al 6 est&aacute;n reservados y la asignaci&oacute;n autom&aacute;tica comienza en el 7.

La lista privada se consulta en `/adminList`. Desde esa pantalla puede descargarse en PDF o en CSV compatible con Excel. El despliegue comprueba que IONOS ejecute PHP y que la carpeta de datos tenga permisos de escritura.
