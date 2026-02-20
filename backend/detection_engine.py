"""
Money Muling Detection Engine
Main orchestration module for fraud detection
"""

from graph_analyzer import GraphAnalyzer
from collections import defaultdict
import hashlib

class MoneyMulingDetector:
    def __init__(self, df):
        self.df = df
        self.analyzer = GraphAnalyzer(df)
        self.fraud_rings = []
        self.suspicious_accounts = {}
        self.ring_counter = 0
    
    def analyze(self):
        """Main analysis pipeline"""
        # Identify legitimate accounts first (to reduce false positives)
        legitimate_accounts = self.analyzer.identify_legitimate_patterns()
        
        # Detect all patterns
        cycles = self.analyzer.detect_cycles()
        fan_in_patterns = self.analyzer.detect_fan_in_patterns()
        fan_out_patterns = self.analyzer.detect_fan_out_patterns()
        shell_networks = self.analyzer.detect_shell_networks()
        
        # Process cycles
        for cycle in cycles:
            # Filter out legitimate accounts
            suspicious_members = [acc for acc in cycle if acc not in legitimate_accounts]
            if len(suspicious_members) >= 2:  # At least 2 suspicious accounts
                self._add_fraud_ring(
                    members=cycle,
                    pattern_type='cycle',
                    detected_patterns=[f'cycle_length_{len(cycle)}']
                )
        
        # Process fan-in patterns
        for pattern in fan_in_patterns:
            account = pattern['account']
            if account not in legitimate_accounts:
                members = [account] + pattern['senders'][:5]  # Include some senders
                self._add_fraud_ring(
                    members=members,
                    pattern_type='fan_in',
                    detected_patterns=['smurfing_aggregation', 'high_velocity']
                )
        
        # Process fan-out patterns
        for pattern in fan_out_patterns:
            account = pattern['account']
            if account not in legitimate_accounts:
                members = [account] + pattern['receivers'][:5]  # Include some receivers
                self._add_fraud_ring(
                    members=members,
                    pattern_type='fan_out',
                    detected_patterns=['smurfing_dispersion', 'high_velocity']
                )
        
        # Process shell networks
        for chain in shell_networks:
            suspicious_members = [acc for acc in chain if acc not in legitimate_accounts]
            if len(suspicious_members) >= 3:
                self._add_fraud_ring(
                    members=chain,
                    pattern_type='shell_network',
                    detected_patterns=['layered_shell', 'low_transaction_intermediary']
                )
        
        # Build final output
        return self._build_output()
    
    def _add_fraud_ring(self, members, pattern_type, detected_patterns):
        """Add a fraud ring and update suspicious accounts"""
        self.ring_counter += 1
        ring_id = f'RING_{self.ring_counter:03d}'
        
        # Calculate risk score based on pattern type and size
        base_score = {
            'cycle': 85,
            'fan_in': 75,
            'fan_out': 75,
            'shell_network': 80
        }.get(pattern_type, 70)
        
        # Adjust score based on ring size
        size_factor = min(len(members) * 2, 15)
        risk_score = min(base_score + size_factor, 100)
        
        self.fraud_rings.append({
            'ring_id': ring_id,
            'member_accounts': members,
            'pattern_type': pattern_type,
            'risk_score': round(risk_score, 1)
        })
        
        # Update suspicious accounts
        for account in members:
            if account not in self.suspicious_accounts:
                self.suspicious_accounts[account] = {
                    'account_id': account,
                    'suspicion_score': 0,
                    'detected_patterns': set(),
                    'ring_ids': []
                }
            
            # Update account suspicion score
            account_data = self.suspicious_accounts[account]
            account_data['detected_patterns'].update(detected_patterns)
            account_data['ring_ids'].append(ring_id)
            
            # Calculate suspicion score
            pattern_scores = {
                'cycle_length_3': 30,
                'cycle_length_4': 25,
                'cycle_length_5': 20,
                'smurfing_aggregation': 25,
                'smurfing_dispersion': 25,
                'high_velocity': 20,
                'layered_shell': 25,
                'low_transaction_intermediary': 15
            }
            
            total_score = sum(
                pattern_scores.get(p, 10) 
                for p in account_data['detected_patterns']
            )
            
            # Add bonus for being in multiple rings
            ring_bonus = (len(account_data['ring_ids']) - 1) * 10
            
            account_data['suspicion_score'] = min(total_score + ring_bonus, 100)
    
    def _build_output(self):
        """Build the final JSON output"""
        # Convert suspicious accounts to list and sort by score
        suspicious_list = []
        for account_id, data in self.suspicious_accounts.items():
            suspicious_list.append({
                'account_id': data['account_id'],
                'suspicion_score': round(data['suspicion_score'], 1),
                'detected_patterns': list(data['detected_patterns']),
                'ring_id': data['ring_ids'][0] if data['ring_ids'] else None
            })
        
        # Sort by suspicion score descending
        suspicious_list.sort(key=lambda x: x['suspicion_score'], reverse=True)
        
        # Get graph data for visualization
        graph_data = self.analyzer.get_graph_data()
        
        # Mark suspicious nodes in graph data
        suspicious_ids = set(self.suspicious_accounts.keys())
        for node in graph_data['nodes']:
            node['is_suspicious'] = node['id'] in suspicious_ids
            if node['id'] in self.suspicious_accounts:
                node['suspicion_score'] = self.suspicious_accounts[node['id']]['suspicion_score']
                node['ring_ids'] = self.suspicious_accounts[node['id']]['ring_ids']
            else:
                node['suspicion_score'] = 0
                node['ring_ids'] = []
        
        # Build summary
        total_accounts = len(graph_data['nodes'])
        
        return {
            'suspicious_accounts': suspicious_list,
            'fraud_rings': self.fraud_rings,
            'summary': {
                'total_accounts_analyzed': total_accounts,
                'suspicious_accounts_flagged': len(suspicious_list),
                'fraud_rings_detected': len(self.fraud_rings),
                'processing_time_seconds': 0  # Will be set by the API
            },
            'graph_data': graph_data
        }