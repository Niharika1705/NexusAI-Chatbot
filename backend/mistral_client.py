import requests
import base64
from backend.config import config

class MistralClient:
    def __init__(self):
        self.api_key = config.MISTRAL_API_KEY
        self.model = config.MISTRAL_MODEL or "mistral-small-latest"
        self.url = "https://api.mistral.ai/v1/chat/completions"

    def get_solution(self, question: str) -> str:
        if not self.api_key:
            return "[Configuration Error] MISTRAL_API_KEY is not set in your .env file. Please add MISTRAL_API_KEY=your_key to .env"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "max_tokens": 400,
            "messages": [
                {
                    "role": "system",
                    "content": "You are NexusAI, a helpful, intelligent assistant. Provide concise answers using clean headers and bullet points. Avoid using raw Markdown pipe tables or double asterisks (**)."
                },
                {
                    "role": "user",
                    "content": question
                }
            ]
        }
        try:
            response = requests.post(self.url, json=payload, headers=headers, timeout=30)
            if response.status_code == 200:
                data = response.json()
                choices = data.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "No content returned from Mistral.")
                return "No response content returned from Mistral AI."
            else:
                return f"Mistral API Error (Status {response.status_code}): {response.text}"
        except Exception as e:
            return f"Error connecting to Mistral API: {str(e)}"

    def get_solution_with_image(self, question: str, image_bytes: bytes, mime_type: str) -> str:
        if not self.api_key:
            return "[Configuration Error] MISTRAL_API_KEY is not set in your .env file."

        base64_image = base64.b64encode(image_bytes).decode('utf-8')
        image_data_url = f"data:{mime_type};base64,{base64_image}"

        prompt_text = (
            f"Solve any problem, question, arithmetic equation, puzzle, or task present in this image.\n\n"
            f"User Prompt/Question: {question if question and question.strip() else 'Solve the problem shown in the image.'}\n\n"
            f"RULES:\n"
            f"1. First, identify any problem, math equation (e.g. 'Solve 2 + 2'), question, or task in the image.\n"
            f"2. ALWAYS provide the clear, direct final answer prominently at the top (e.g., 'Answer: 2 + 2 = 4').\n"
            f"3. Provide concise step-by-step explanation underneath.\n"
            f"4. Do NOT merely describe the visual texture, background, or frame of the image unless asked."
        )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        # Try valid vision models on Mistral AI API
        vision_models = ["pixtral-12b-2409", "mistral-small-latest", "mistral-large-latest"]

        last_error = None
        for vision_model in vision_models:
            payload = {
                "model": vision_model,
                "max_tokens": 400,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt_text
                            },
                            {
                                "type": "image_url",
                                "image_url": image_data_url
                            }
                        ]
                    }
                ]
            }

            try:
                response = requests.post(self.url, json=payload, headers=headers, timeout=60)
                if response.status_code == 200:
                    data = response.json()
                    choices = data.get("choices", [])
                    if choices:
                        content = choices[0].get("message", {}).get("content")
                        if content:
                            return content
                else:
                    last_error = f"Model {vision_model} error ({response.status_code}): {response.text}"
            except Exception as e:
                last_error = str(e)

        return f"Could not analyze image with vision model. ({last_error})"
