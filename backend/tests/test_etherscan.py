import httpx
import asyncio

async def test_etherscan():
    address = "0x28c6c06298d514db089934071355e5743bf21d60"
    api_key = "TNYWQWSTUV3T4QHRTU69P8UIBQF1N12CFQ"
    
    params = {
        "chainid": 1,
        "module": "account",
        "action": "txlist",
        "address": address,
        "startblock": 0,
        "endblock": 99999999,
        "page": 1,
        "offset": 10,
        "sort": "desc",
        "apikey": api_key,
    }
    
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get("https://api.etherscan.io/v2/api", params=params)
        print(f"Status Code: {resp.status_code}")
        data = resp.json()
        print(f"API Status: {data.get('status')}")
        print(f"API Message: {data.get('message')}")
        print(f"Result count: {len(data.get('result', []))}")
        if isinstance(data.get('result'), list) and len(data.get('result', [])) > 0:
            print(f"First tx hash: {data['result'][0].get('hash', 'N/A')}")

asyncio.run(test_etherscan())
