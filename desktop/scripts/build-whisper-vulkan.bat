@echo off
rem Compila whisper.cpp PORTABLE con soporte de GPU (Vulkan) en Windows.
rem Requisitos: Visual Studio 2022 con "Desarrollo para el escritorio con C++" y el SDK de Vulkan
rem (https://vulkan.lunarg.com). CMake y Ninja vienen incluidos en Visual Studio.
rem Uso:  build-whisper-vulkan.bat <carpeta-con-el-codigo-de-whisper.cpp> [<ruta-del-SDK-de-Vulkan>]
rem Resultado: <carpeta>\build-portable\bin  ->  usar con:  set WHISPER_BUILD_DIR=<carpeta>\build-portable\bin
rem            y luego:  npm run fetch:binaries --workspace=@audio-to-text/desktop
setlocal
set "SRC=%~1"
if "%SRC%"=="" (echo Falta la carpeta de whisper.cpp & exit /b 1)
if not "%~2"=="" set "VULKAN_SDK=%~2"
if "%VULKAN_SDK%"=="" (echo Define VULKAN_SDK o pasalo como segundo argumento & exit /b 1)
set "VSROOT=C:\Program Files\Microsoft Visual Studio\2022\Community"
call "%VSROOT%\VC\Auxiliary\Build\vcvars64.bat" || exit /b 1
set "PATH=%VSROOT%\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;%VSROOT%\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%VULKAN_SDK%\Bin;%PATH%"
cd /d "%SRC%" || exit /b 1
rem GGML_BACKEND_DL + CPU_ALL_VARIANTS + NATIVE=OFF: el binario elige en ejecucion la mejor variante de CPU
rem y carga Vulkan solo si hay GPU/driver; si no, cae a CPU. Asi el mismo instalador sirve en otros equipos.
cmake -S . -B build-portable -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=1 -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON -DGGML_NATIVE=OFF -DBUILD_SHARED_LIBS=ON -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_BUILD_TESTS=OFF || exit /b 2
cmake --build build-portable --config Release -j 8 || exit /b 3
echo OK: %SRC%\build-portable\bin
