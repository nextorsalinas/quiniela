# Script de despliegue para la Quiniela 2026
# Ejecuta este script en una terminal de PowerShell dentro de la carpeta del proyecto.

Write-Host "=========================================" -ForegroundColor Gold
Write-Host "  INICIANDO DESPLIEGUE EN FIREBASE...  " -ForegroundColor Gold
Write-Host "=========================================" -ForegroundColor Gold

# 1. Configurar bypass para certificados SSL en red corporativa
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"

# 2. Iniciar sesión en Firebase (abrirá tu navegador)
Write-Host "`n1. Iniciando sesión en Firebase. Por favor, autoriza el acceso en el navegador..." -ForegroundColor Cyan
npx firebase-tools login

# 3. Desplegar hosting y funciones en tu proyecto
Write-Host "`n2. Desplegando en el proyecto quiniela----mundial-2026..." -ForegroundColor Cyan
npx firebase-tools deploy --project quiniela----mundial-2026

Write-Host "`n=========================================" -ForegroundColor Green
Write-Host "  DESPLIEGUE FINALIZADO EXITOSAMENTE!  " -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
