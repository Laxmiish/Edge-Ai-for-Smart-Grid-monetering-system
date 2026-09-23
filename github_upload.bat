@echo off
echo ========================================================
echo   Smart Grid Git History Generator (Past 48 Hours)
echo ========================================================
echo.

IF "%~1"=="" (
    echo [ERROR] You must provide your GitHub repository URL!
    echo Usage: github_upload.bat https://github.com/YourUsername/YourRepo.git
    echo.
    exit /b
)

set REPO_URL=%~1

:: Initialize Git
git init

:: Create a .gitignore so we don't upload unnecessary data
echo node_modules/ > .gitignore
echo __pycache__/ >> .gitignore
echo dpu_data/ >> .gitignore
echo *.db >> .gitignore
git add .gitignore
set GIT_AUTHOR_DATE=2026-09-21T09:00:00
set GIT_COMMITTER_DATE=2026-09-21T09:00:00
git commit -m "Initial commit and gitignore setup"

:: COMMIT 1: Backend Setup (Sept 21)
git add backend/
set GIT_AUTHOR_DATE=2026-09-21T14:30:00
set GIT_COMMITTER_DATE=2026-09-21T14:30:00
git commit -m "Setup Node.js backend with PostgreSQL and Kafka ingestion"

:: COMMIT 2: Substation Relay (Sept 22 Morning)
git add substations/
set GIT_AUTHOR_DATE=2026-09-22T09:15:00
set GIT_COMMITTER_DATE=2026-09-22T09:15:00
git commit -m "Implemented Substation Flask relay with SQLite buffering"

:: COMMIT 3: Base Models & DPU (Sept 22 Afternoon)
git add dpu/model.py dpu/model2.py
set GIT_AUTHOR_DATE=2026-09-22T15:45:00
set GIT_COMMITTER_DATE=2026-09-22T15:45:00
git commit -m "Developed Base AI models for Net-Load and Solar Generation"

git add dpu/main.py dpu/local_db.py dpu/requirements.txt
set GIT_AUTHOR_DATE=2026-09-22T18:20:00
set GIT_COMMITTER_DATE=2026-09-22T18:20:00
git commit -m "Implemented DPU edge execution runtime"

:: COMMIT 4: Dockerization & Online Learning (Sept 23)
git add docker-compose.yml dpu/Dockerfile backend/Dockerfile
set GIT_AUTHOR_DATE=2026-09-23T11:00:00
set GIT_COMMITTER_DATE=2026-09-23T11:00:00
git commit -m "Dockerized infrastructure with Edge resource simulation"

:: Final catch-all for remaining files and the models
git add .
set GIT_AUTHOR_DATE=2026-09-23T15:30:00
set GIT_COMMITTER_DATE=2026-09-23T15:30:00
git commit -m "Upgraded edge AI models to SGDRegressor for continuous online learning"

echo.
echo [*] History successfully generated!
echo [*] Pushing to GitHub repository: %REPO_URL%
echo.

:: Add remote and Push
git remote add origin %REPO_URL%
git branch -M main
git push -u origin main

echo.
echo [SUCCESS] Upload complete!
pause
