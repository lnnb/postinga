#!/bin/bash
# Postinga — lanzador para macOS
# Doble clic sobre este archivo para abrir el editor en el navegador.

cd "$(dirname "$0")" || exit 1

echo ""
echo "  Postinga"
echo "  ─────────────────────────────────────────────"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  No encontré Node.js en este equipo."
  echo ""
  echo "  Opción rápida: bajalo de https://nodejs.org (versión LTS)."
  echo "  Mientras tanto podés abrir el archivo index.html directamente"
  echo "  y el editor funciona igual, sin el lector de enlaces local."
  echo ""
  read -n 1 -s -r -p "  Presioná Enter para cerrar."
  echo ""
  exit 1
fi

node server.js --open

echo ""
read -n 1 -s -r -p "  El servidor se detuvo. Presioná Enter para cerrar."
echo ""
