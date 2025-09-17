# SIGAD - TIMMER

Base del proyecto para un timer de torneos Pokémon usando React + Vite. Se retiró DaisyUI y ahora la interfaz principal usa clases de Bootstrap y utilidades personalizadas.

## Scripts

- `npm run dev` inicia entorno de desarrollo
- `npm run build` construye para producción
- `npm run preview` sirve build

## Características iniciales

- Panel multi‑torneos con timers independientes
- Añadir minutos (+1, +5)
- Pausa / Reanudar / Reset / Fin / Siguiente ronda
- ETA estimada y mini planificador

## Próximos pasos sugeridos

- Vista separada de pantalla (display) para proyectores
- Sincronización (p.e. WebSocket) para múltiples clientes
- Persistencia en localStorage
- Sonidos / alertas al terminar
- Modo multi-timer para diferentes pods

## Inicio rápido

```bash
npm install
npm run dev
```

## Publicar en GitHub con GitHub Desktop

1) Abrir la carpeta del proyecto en GitHub Desktop:
	- En GitHub Desktop: `File` → `Add local repository…` → selecciona la carpeta `SIGAD-TIMMER-TCG`.
	- Si te pide inicializar Git, acepta para crear el repo local.

2) Revisa los archivos a commitear:
	- Verifica que `.gitignore` está presente y que `node_modules/` y `dist/` no se incluyen.
	- Asegúrate de no subir secretos. Si usas `src/credenciales.json`, considera reemplazarlo por un `src/credenciales.example.json` y excluir el real.

3) Primer commit:
	- Escribe un mensaje (por ejemplo: `chore: initial commit`) y presiona `Commit to main`.

4) Publicar en GitHub:
	- Haz clic en `Publish repository…`, define el nombre y visibilidad (Privado recomendado) y confirma.

5) Subidas futuras:
	- Usa `Fetch origin` / `Push origin` en GitHub Desktop para sincronizar cambios.

### Consejos

- Si decides mantener `dist/` fuera del repo (recomendado), ya está ignorado en `.gitignore`.
- Para compartir una build, ejecuta `npm run build` y sube el contenido de `dist/` a tu hosting estático preferido (p. ej., GitHub Pages, Vercel, Netlify).
- Si necesitas credenciales locales, usa un archivo `src/credenciales.local.json` (excluido por `.gitignore`) y carga condicionalmente en desarrollo.
