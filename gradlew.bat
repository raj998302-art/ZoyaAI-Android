@rem Gradle startup script for Windows
@if "%DEBUG%"=="" @echo off
@rem Check for existing system Gradle
where gradle >nul 2>&1
if %ERRORLEVEL% == 0 (
  gradle %*
  exit /b %ERRORLEVEL%
)
@rem Fall back to wrapper jar if present
set WRAPPER_JAR=%~dp0gradle\wrapper\gradle-wrapper.jar
if exist "%WRAPPER_JAR%" (
  java -jar "%WRAPPER_JAR%" %*
) else (
  echo ERROR: gradle not found. Install Android Studio or Gradle manually.
  exit /b 1
)
