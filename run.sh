#!/bin/bash

# Define colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}     RIFT 2026 HACKATHON - MONEY MULING DETECTION${NC}"
echo -e "${BLUE}     Running on Linux/Ubuntu${NC}"
echo -e "${BLUE}==========================================================${NC}"

# 1. Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[ERROR] Python 3 could not be found.${NC}"
    echo "Please install it using: sudo apt install python3"
    exit 1
fi

# 2. Check for python3-venv (Common issue on Ubuntu)
dpkg -s python3-venv &> /dev/null
if [ $? -ne 0 ]; then
    echo -e "${BLUE}[INFO] Installing python3-venv package...${NC}"
    sudo apt-get update && sudo apt-get install -y python3-venv
fi

# 3. Create Virtual Environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo -e "${BLUE}[INFO] Creating virtual environment...${NC}"
    python3 -m venv venv
fi

# 4. Activate Virtual Environment
echo -e "${BLUE}[INFO] Activating virtual environment...${NC}"
source venv/bin/activate

# 5. Install Requirements
echo -e "${BLUE}[INFO] Installing dependencies...${NC}"
pip install -r backend/requirements.txt

# 6. Start the Server
echo -e "${GREEN}==========================================================${NC}"
echo -e "${GREEN}[STARTING] Launching Flask Server...${NC}"
echo -e "${GREEN}   OPEN BROWSER TO: http://127.0.0.1:5000${NC}"
echo -e "${GREEN}   Press CTRL+C to stop.${NC}"
echo -e "${GREEN}==========================================================${NC}"

cd backend
python3 app.py

