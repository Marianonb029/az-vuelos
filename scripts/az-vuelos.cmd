@echo off
rem Levanta AZ Vuelos para usarla: el API (127.0.0.1:3001) y la web (localhost:5173) quedan corriendo en dos
rem ventanas minimizadas hasta que las cierres, y se abre el navegador. Si ya estan corriendo, solo abre el
rem navegador. Lo corre la tarea programada "AZ Vuelos - servidores" al iniciar sesion, o vos a mano.
rem No usa pnpm (ver precios-nocturno.cmd): node + tsx y vite del propio repo. El token TRAVELPAYOUTS_TOKEN sale
rem de las variables de entorno del usuario (setx), igual que para pnpm dev.
cd /d "%~dp0.."
set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
if not exist data\local mkdir data\local

netstat -ano | findstr /r /c:"127.0.0.1:3001 .*LISTENING" >nul
if errorlevel 1 (
  start "AZ Vuelos - api" /min cmd /c ""%NODE%" node_modules\tsx\dist\cli.mjs apps\api\src\servidor.ts >> data\local\api.log 2>&1"
)
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if errorlevel 1 (
  start "AZ Vuelos - web" /min cmd /c "cd /d apps\web && "%NODE%" node_modules\vite\bin\vite.js >> ..\..\data\local\web.log 2>&1"
)
if "%~1"=="/sin-navegador" goto :fin
rem Espera a que vite responda antes de abrir el navegador (ping en vez de timeout: timeout falla si la entrada
rem esta redirigida, como cuando lo lanza otro proceso).
ping -n 5 127.0.0.1 >nul
start "" http://localhost:5173
:fin
