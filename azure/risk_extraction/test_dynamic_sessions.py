from azure.identity import AzureCliCredential
import requests

POOL_MANAGEMENT_ENDPOINT = "https://eastus2.dynamicsessions.io/subscriptions/ecdb54a0-605e-4b0f-a3ba-f935d762e0e4/resourceGroups/rg-landlease-portfolio-payg/sessionPools/sesspool-landlease-poc"

credential = AzureCliCredential()
token = credential.get_token("https://dynamicsessions.io/.default").token
print("トークン取得成功。長さ:", len(token))

url = f"{POOL_MANAGEMENT_ENDPOINT}/code/execute?api-version=2024-02-02-preview&identifier=test-session-1"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
body = {
    "properties": {
        "codeInputType": "inline",
        "executionType": "synchronous",
        "code": "1200000 / 12"
    }
}

response = requests.post(url, headers=headers, json=body)
print("送信したリクエストボディ:", response.request.body)
print("ステータスコード:", response.status_code)
print("本文:", response.text)