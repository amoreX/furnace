#!/usr/bin/env python3
"""
BFS and DFS Graph Traversal Algorithm Demonstrations
"""

from collections import deque


class Graph:
    """Simple graph implementation using adjacency list"""
    
    def __init__(self):
        self.graph = {}
    
    def add_edge(self, u, v):
        """Add an edge from u to v"""
        if u not in self.graph:
            self.graph[u] = []
        if v not in self.graph:
            self.graph[v] = []
        self.graph[u].append(v)
    
    def bfs(self, start):
        """Breadth-First Search traversal"""
        visited = set()
        queue = deque([start])
        visited.add(start)
        result = []
        
        print(f"\nBFS starting from node '{start}':")
        
        while queue:
            node = queue.popleft()
            result.append(node)
            print(f"  Visiting: {node}")
            
            # Visit all neighbors
            if node in self.graph:
                for neighbor in self.graph[node]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
        
        return result
    
    def dfs(self, start):
        """Depth-First Search traversal (iterative)"""
        visited = set()
        stack = [start]
        result = []
        
        print(f"\nDFS starting from node '{start}':")
        
        while stack:
            node = stack.pop()
            
            if node not in visited:
                visited.add(node)
                result.append(node)
                print(f"  Visiting: {node}")
                
                # Add neighbors to stack (in reverse to maintain left-to-right order)
                if node in self.graph:
                    for neighbor in reversed(self.graph[node]):
                        if neighbor not in visited:
                            stack.append(neighbor)
        
        return result
    
    def dfs_recursive(self, start, visited=None, result=None):
        """Depth-First Search traversal (recursive)"""
        if visited is None:
            visited = set()
            result = []
            print(f"\nDFS (Recursive) starting from node '{start}':")
        
        visited.add(start)
        result.append(start)
        print(f"  Visiting: {start}")
        
        if start in self.graph:
            for neighbor in self.graph[start]:
                if neighbor not in visited:
                    self.dfs_recursive(neighbor, visited, result)
        
        return result


def main():
    print("=" * 60)
    print("BFS and DFS Graph Traversal Demonstration")
    print("=" * 60)
    
    # Create a sample graph
    #       A
    #      / \
    #     B   C
    #    / \   \
    #   D   E   F
    #        \ /
    #         G
    
    g = Graph()
    g.add_edge('A', 'B')
    g.add_edge('A', 'C')
    g.add_edge('B', 'D')
    g.add_edge('B', 'E')
    g.add_edge('C', 'F')
    g.add_edge('E', 'G')
    g.add_edge('F', 'G')
    
    print("\nGraph structure:")
    print("       A")
    print("      / \\")
    print("     B   C")
    print("    / \\   \\")
    print("   D   E   F")
    print("        \\ /")
    print("         G")
    
    # Run BFS
    bfs_result = g.bfs('A')
    print(f"\nBFS Order: {' -> '.join(bfs_result)}")
    
    # Run DFS (iterative)
    dfs_result = g.dfs('A')
    print(f"\nDFS Order: {' -> '.join(dfs_result)}")
    
    # Run DFS (recursive)
    dfs_rec_result = g.dfs_recursive('A')
    print(f"\nDFS Recursive Order: {' -> '.join(dfs_rec_result)}")
    
    print("\n" + "=" * 60)
    print("Key Differences:")
    print("- BFS uses a Queue (FIFO) - explores level by level")
    print("- DFS uses a Stack (LIFO) - explores as deep as possible first")
    print("=" * 60)


if __name__ == "__main__":
    main()
