"""
Graph Analysis Module for Money Muling Detection
Implements cycle detection, smurfing detection, and shell network analysis
"""

import networkx as nx
from collections import defaultdict
from datetime import datetime, timedelta
import numpy as np

class GraphAnalyzer:
    def __init__(self, df):
        self.df = df
        self.G = nx.DiGraph()
        self.node_transactions = defaultdict(list)
        self.edge_transactions = defaultdict(list)
        self._build_graph()
    
    def _build_graph(self):
        """Build directed graph from transaction data"""
        for _, row in self.df.iterrows():
            sender = row['sender_id']
            receiver = row['receiver_id']
            amount = float(row['amount'])
            timestamp = row['timestamp']
            
            # Add nodes with attributes
            if sender not in self.G:
                self.G.add_node(sender, total_sent=0, total_received=0, 
                               transaction_count=0, timestamps=[])
            if receiver not in self.G:
                self.G.add_node(receiver, total_sent=0, total_received=0,
                               transaction_count=0, timestamps=[])
            
            # Update node attributes
            self.G.nodes[sender]['total_sent'] += amount
            self.G.nodes[sender]['transaction_count'] += 1
            self.G.nodes[sender]['timestamps'].append(timestamp)
            
            self.G.nodes[receiver]['total_received'] += amount
            self.G.nodes[receiver]['transaction_count'] += 1
            self.G.nodes[receiver]['timestamps'].append(timestamp)
            
            # Add or update edge
            if self.G.has_edge(sender, receiver):
                self.G[sender][receiver]['weight'] += amount
                self.G[sender][receiver]['count'] += 1
                self.G[sender][receiver]['transactions'].append({
                    'amount': amount, 'timestamp': timestamp
                })
            else:
                self.G.add_edge(sender, receiver, weight=amount, count=1,
                               transactions=[{'amount': amount, 'timestamp': timestamp}])
            
            # Store transaction references
            self.node_transactions[sender].append(row.to_dict())
            self.node_transactions[receiver].append(row.to_dict())
            self.edge_transactions[(sender, receiver)].append(row.to_dict())
    
    def detect_cycles(self, min_length=3, max_length=5):
        """
        Detect cycles of length 3 to 5 (circular fund routing)
        Time Complexity: O(V + E) for each DFS
        """
        cycles = []
        visited_cycles = set()
        
        def find_cycles_from_node(start, current, path, depth):
            if depth > max_length:
                return
            
            for neighbor in self.G.successors(current):
                if neighbor == start and len(path) >= min_length:
                    # Found a cycle
                    cycle = tuple(sorted(path))
                    if cycle not in visited_cycles:
                        visited_cycles.add(cycle)
                        cycles.append(list(path))
                elif neighbor not in path and depth < max_length:
                    find_cycles_from_node(start, neighbor, path + [neighbor], depth + 1)
        
        # Find cycles starting from each node
        for node in self.G.nodes():
            find_cycles_from_node(node, node, [node], 1)
        
        return cycles
    
    def detect_fan_in_patterns(self, threshold=10, time_window_hours=72):
        """
        Detect fan-in patterns (smurfing - aggregation)
        Multiple accounts sending to one aggregator
        """
        fan_in_accounts = []
        
        for node in self.G.nodes():
            predecessors = list(self.G.predecessors(node))
            
            if len(predecessors) >= threshold:
                # Check temporal clustering
                incoming_transactions = []
                for pred in predecessors:
                    incoming_transactions.extend(
                        self.G[pred][node]['transactions']
                    )
                
                # Check if transactions are within time window
                if self._check_temporal_clustering(incoming_transactions, time_window_hours):
                    fan_in_accounts.append({
                        'account': node,
                        'sender_count': len(predecessors),
                        'senders': predecessors,
                        'pattern_type': 'fan_in'
                    })
        
        return fan_in_accounts
    
    def detect_fan_out_patterns(self, threshold=10, time_window_hours=72):
        """
        Detect fan-out patterns (smurfing - dispersion)
        One account sending to multiple receivers
        """
        fan_out_accounts = []
        
        for node in self.G.nodes():
            successors = list(self.G.successors(node))
            
            if len(successors) >= threshold:
                # Check temporal clustering
                outgoing_transactions = []
                for succ in successors:
                    outgoing_transactions.extend(
                        self.G[node][succ]['transactions']
                    )
                
                if self._check_temporal_clustering(outgoing_transactions, time_window_hours):
                    fan_out_accounts.append({
                        'account': node,
                        'receiver_count': len(successors),
                        'receivers': successors,
                        'pattern_type': 'fan_out'
                    })
        
        return fan_out_accounts
    
    def detect_shell_networks(self, min_chain_length=3, max_transactions=3):
        """
        Detect layered shell networks
        Chains of accounts with low transaction counts
        """
        shell_chains = []
        visited = set()
        
        def find_shell_chain(start, path):
            current = path[-1]
            
            for successor in self.G.successors(current):
                if successor not in path and successor not in visited:
                    node_tx_count = self.G.nodes[successor]['transaction_count']
                    
                    # Check if intermediate node has low transaction count
                    if node_tx_count <= max_transactions:
                        new_path = path + [successor]
                        
                        if len(new_path) >= min_chain_length:
                            shell_chains.append(new_path)
                        
                        find_shell_chain(start, new_path)
        
        for node in self.G.nodes():
            if self.G.nodes[node]['transaction_count'] <= max_transactions:
                find_shell_chain(node, [node])
                visited.add(node)
        
        return shell_chains
    
    def _check_temporal_clustering(self, transactions, time_window_hours):
        """Check if transactions cluster within a time window"""
        if len(transactions) < 2:
            return False
        
        try:
            timestamps = []
            for tx in transactions:
                ts = tx['timestamp']
                if isinstance(ts, str):
                    timestamps.append(datetime.strptime(ts, '%Y-%m-%d %H:%M:%S'))
                else:
                    timestamps.append(ts)
            
            timestamps.sort()
            
            # Check if any consecutive transactions are within the window
            window = timedelta(hours=time_window_hours)
            for i in range(len(timestamps) - 1):
                if timestamps[i + 1] - timestamps[i] <= window:
                    return True
            
            return False
        except:
            return True  # Assume suspicious if we can't parse
    
    def identify_legitimate_patterns(self):
        """
        Identify potentially legitimate high-volume accounts
        (merchants, payroll) to reduce false positives
        """
        legitimate_accounts = set()
        
        for node in self.G.nodes():
            in_degree = self.G.in_degree(node)
            out_degree = self.G.out_degree(node)
            
            # High in-degree but low out-degree suggests merchant
            if in_degree > 20 and out_degree <= 2:
                legitimate_accounts.add(node)
            
            # Consistent amounts suggest payroll
            if out_degree > 10:
                amounts = []
                for succ in self.G.successors(node):
                    for tx in self.G[node][succ]['transactions']:
                        amounts.append(tx['amount'])
                
                if len(amounts) > 5:
                    # Check if amounts are similar (std dev < 10% of mean)
                    mean_amt = np.mean(amounts)
                    std_amt = np.std(amounts)
                    if std_amt < 0.1 * mean_amt:
                        legitimate_accounts.add(node)
            
            # Check for merchant-like naming patterns
            if any(keyword in node.upper() for keyword in 
                   ['MERCHANT', 'PAYROLL', 'SALARY', 'CORP', 'INC', 'LLC']):
                legitimate_accounts.add(node)
        
        return legitimate_accounts
    
    def get_graph_data(self):
        """Return graph data for visualization"""
        nodes = []
        edges = []
        
        for node in self.G.nodes():
            nodes.append({
                'id': node,
                'total_sent': round(self.G.nodes[node]['total_sent'], 2),
                'total_received': round(self.G.nodes[node]['total_received'], 2),
                'transaction_count': self.G.nodes[node]['transaction_count']
            })
        
        for u, v, data in self.G.edges(data=True):
            edges.append({
                'source': u,
                'target': v,
                'weight': round(data['weight'], 2),
                'count': data['count']
            })
        
        return {'nodes': nodes, 'edges': edges}