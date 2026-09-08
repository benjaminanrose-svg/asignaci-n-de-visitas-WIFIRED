# Dos Claude en paralelo

Trabajo con **dos** asistentes:

## 💻 Claude local (mi PC, modelo gratis vía router)
- Endpoint router: `http://127.0.0.1:3456`. Modelo gratis (ej. `glm-5.2:free`),
  con respaldo automático si se satura (429).
- Para: cosas **simples** — textos, cambios chicos, notas de Obsidian, pruebas.

## 🌩️ Claude nube (modelo bueno)
- Para: lo **complejo/delicado** (bot, seguridad, DB) y **revisar** lo que hizo
  el local.

## Flujo
1. El local avanza algo → dejo el cambio hecho.
2. Hago **commit con GitHub Desktop** (rama de trabajo).
3. Cuando tengo tokens del bueno, **revisa y corrige**.

## Regla para no chocar
No trabajar el **mismo archivo** a la vez. Usar la misma rama de trabajo.

Ver [[Reglas]] · [[WIFIRED]]
