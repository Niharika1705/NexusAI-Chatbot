import requests
import sys

# Change this if the FastAPI server runs on a different host/port
API_URL = "http://localhost:8005/ask"

def main():
    print("="*50)
    print("Welcome to NexusAI CLI")
    print("Type your question and press Enter.")
    print("Type 'exit' or 'quit' to close.")
    print("="*50)

    while True:
        try:
            question = input("\n[You] : ")
            if question.lower().strip() in ['exit', 'quit']:
                print("Goodbye!")
                break
                
            if not question.strip():
                continue
                
            print("Thinking...")
            
            # Send question to FastAPI backend
            response = requests.post(API_URL, json={"question": question})
            
            if response.status_code == 200:
                data = response.json()
                solution = data.get("solution", "")
                
                print("\n[NexusAI] :")
                print("-" * 50)
                print(solution)
                print("-" * 50)
            else:
                print(f"[Error]: Server responded with status code {response.status_code}")
                
        except requests.exceptions.ConnectionError:
            print("[Error]: Could not connect to the backend server. Is it running?")
        except KeyboardInterrupt:
            print("\nGoodbye!")
            sys.exit(0)
            
if __name__ == "__main__":
    main()
