@echo off
rem Corrida nocturna de la bajada por continentes (Tarea programada de Windows "AZ Vuelos - precios nocturno",
rem todos los dias a las 03:00). Sigue donde quedo la corrida anterior; el token sale de la variable de entorno del
rem usuario TRAVELPAYOUTS_TOKEN. Registro en data\local\precios-nocturno.log (ignorado por git).
rem No usa pnpm: en esta maquina pnpm quedo instalado dentro del entorno virtualizado de la app de escritorio de
rem Claude (AppData virtualizado) y la tarea programada no lo ve. Corre lo mismo que `pnpm precios` con node + tsx
rem del propio repo.
cd /d "%~dp0.."
if not exist data\local mkdir data\local
set "LOG=data\local\precios-nocturno.log"
set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
echo ==== %date% %time% >> "%LOG%"
call "%NODE%" node_modules\tsx\dist\cli.mjs scripts\precios-travelpayouts.ts >> "%LOG%" 2>&1
echo ==== fin %date% %time% (codigo %ERRORLEVEL%) >> "%LOG%"
