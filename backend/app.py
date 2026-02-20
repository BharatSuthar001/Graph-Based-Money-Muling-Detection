"""
Money Muling Detection Engine - Flask Backend
RIFT 2026 Hackathon - Graph Theory Track
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pandas as pd
import os
import time
import json
from werkzeug.utils import secure_filename
from detection_engine import MoneyMulingDetector
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure Gemini API
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'csv'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def serve_frontend():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "message": "Money Muling Detection Engine is running"})

@app.route('/api/analyze', methods=['POST'])
def analyze_transactions():
    start_time = time.time()
    
    # Check if file is present
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type. Please upload a CSV file"}), 400
    
    try:
        # Read CSV file with automatic delimiter detection and skip malformed rows
        df = pd.read_csv(file, sep=None, engine='python', on_bad_lines='skip', encoding_errors='ignore')
        
        # Validate required columns
        required_columns = ['transaction_id', 'sender_id', 'receiver_id', 'amount', 'timestamp']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            return jsonify({
                "error": f"Missing required columns: {', '.join(missing_columns)}"
            }), 400
        
        # Initialize detector and run analysis
        detector = MoneyMulingDetector(df)
        results = detector.analyze()
        
        # Calculate processing time
        processing_time = round(time.time() - start_time, 2)
        results['summary']['processing_time_seconds'] = processing_time
        
        # Optional: Add AI insights for the fraud rings
        if results['fraud_rings'] and os.environ.get("GOOGLE_API_KEY"):
            try:
                ai_insight = get_ai_explanation(results['fraud_rings'], results['summary'])
                results['summary']['ai_insight'] = ai_insight
            except Exception as e:
                print(f"AI insight failed: {e}")
        
        return jsonify(results)
    
    except pd.errors.EmptyDataError:
        return jsonify({"error": "The uploaded CSV file is empty"}), 400
    except pd.errors.ParserError as e:
        return jsonify({"error": f"CSV Format Error: {str(e)}. Please ensure the file is comma-separated and has the correct columns."}), 400
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

@app.route('/api/sample-data', methods=['GET'])
def get_sample_data():
    """Generate sample transaction data for testing"""
    sample_data = generate_sample_data()
    return jsonify(sample_data)

def get_ai_explanation(rings, summary):
    """Use Gemini AI to explain the detected fraud patterns"""
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    # Prepare data for the prompt
    patterns = set(r['pattern_type'] for r in rings)
    ring_count = len(rings)
    
    prompt = f"""
    As a Financial Forensics Expert, analyze these money muling detection results:
    - Total rings detected: {ring_count}
    - Pattern types found: {', '.join(patterns)}
    - Total accounts analyzed: {summary['total_accounts_analyzed']}
    - Suspicious accounts flagged: {summary['suspicious_accounts_flagged']}
    
    Provide a professional, brief (2-3 sentence) forensic summary of the risk levels and what these specific patterns (like {', '.join(patterns)}) usually indicate in a real-world money laundering context.
    """
    
    response = model.generate_content(prompt)
    return response.text

def generate_sample_data():
    """Generate sample CSV content with known fraud patterns"""
    import random
    from datetime import datetime, timedelta
    
    transactions = []
    base_time = datetime(2024, 1, 1, 10, 0, 0)
    tx_id = 1000
    
    # Pattern 1: Cycle (A -> B -> C -> A)
    cycle_accounts = ['ACC_001', 'ACC_002', 'ACC_003']
    for i in range(3):
        sender = cycle_accounts[i]
        receiver = cycle_accounts[(i + 1) % 3]
        transactions.append({
            'transaction_id': f'TX_{tx_id}',
            'sender_id': sender,
            'receiver_id': receiver,
            'amount': round(random.uniform(5000, 10000), 2),
            'timestamp': (base_time + timedelta(hours=i*2)).strftime('%Y-%m-%d %H:%M:%S')
        })
        tx_id += 1
    
    # Pattern 2: Fan-in (Multiple -> One)
    aggregator = 'ACC_AGG_001'
    for i in range(12):
        transactions.append({
            'transaction_id': f'TX_{tx_id}',
            'sender_id': f'ACC_SRC_{i:03d}',
            'receiver_id': aggregator,
            'amount': round(random.uniform(500, 2000), 2),
            'timestamp': (base_time + timedelta(hours=i)).strftime('%Y-%m-%d %H:%M:%S')
        })
        tx_id += 1
    
    # Pattern 3: Fan-out (One -> Multiple)
    disperser = 'ACC_DISP_001'
    for i in range(12):
        transactions.append({
            'transaction_id': f'TX_{tx_id}',
            'sender_id': disperser,
            'receiver_id': f'ACC_DST_{i:03d}',
            'amount': round(random.uniform(500, 2000), 2),
            'timestamp': (base_time + timedelta(hours=24+i)).strftime('%Y-%m-%d %H:%M:%S')
        })
        tx_id += 1
    
    # Pattern 4: Layered Shell Network
    shell_chain = ['ACC_SHELL_001', 'ACC_SHELL_002', 'ACC_SHELL_003', 'ACC_SHELL_004']
    for i in range(len(shell_chain) - 1):
        transactions.append({
            'transaction_id': f'TX_{tx_id}',
            'sender_id': shell_chain[i],
            'receiver_id': shell_chain[i + 1],
            'amount': round(random.uniform(8000, 15000), 2),
            'timestamp': (base_time + timedelta(hours=48+i*3)).strftime('%Y-%m-%d %H:%M:%S')
        })
        tx_id += 1
    
    # Normal transactions (to test false positive handling)
    merchants = ['MERCHANT_AMAZON', 'MERCHANT_WALMART', 'PAYROLL_CORP']
    for merchant in merchants:
        for i in range(15):
            transactions.append({
                'transaction_id': f'TX_{tx_id}',
                'sender_id': f'CUSTOMER_{random.randint(100, 999)}',
                'receiver_id': merchant,
                'amount': round(random.uniform(50, 500), 2),
                'timestamp': (base_time + timedelta(days=random.randint(0, 30))).strftime('%Y-%m-%d %H:%M:%S')
            })
            tx_id += 1
    
    return transactions

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)