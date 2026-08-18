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

