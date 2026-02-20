
## 📊 Algorithm Approach

### 1. Cycle Detection (Circular Fund Routing)
- **Algorithm:** DFS-based cycle finding
- **Complexity:** O(V + E) per starting node, O(V × (V + E)) total
- **Detection:** Cycles of length 3-5

### 2. Smurfing Detection (Fan-in/Fan-out)
- **Fan-in:** Identifies aggregator accounts with 10+ incoming connections
- **Fan-out:** Identifies disperser accounts with 10+ outgoing connections
- **Temporal Analysis:** 72-hour window clustering

### 3. Shell Network Detection
- **Algorithm:** Path finding with transaction count filtering
- **Detection:** Chains of 3+ hops through low-activity accounts

## 📈 Suspicion Score Methodology

| Pattern | Base Score |
|---------|------------|
| Cycle (length 3) | 30 |
| Cycle (length 4-5) | 20-25 |
| Smurfing (aggregation) | 25 |
| Smurfing (dispersion) | 25 |
| High velocity | 20 |
| Layered shell | 25 |
| Multiple ring membership | +10 per additional ring |

**Final Score:** Capped at 100

## 🚀 Installation & Setup

### Prerequisites
- Python 3.9+
- pip (Python package manager)

### Local Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/money-muling-detection.git
cd money-muling-detection

# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt

# Run the application
cd backend
python app.py