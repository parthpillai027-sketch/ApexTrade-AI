"""
Unit tests for the Flask REST API server.
"""

import unittest
import json
from server import app


class TestServerAPI(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_root_endpoint(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)

    def test_health_endpoint(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(set(data["models_available"]), {"Lion", "Tiger"})

    def test_tickers_endpoint(self):
        resp = self.client.get("/api/tickers")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertIn("categories", data)
        self.assertIn("Tech Leaders", data["categories"])

    def test_quote_endpoint(self):
        resp = self.client.get("/api/quote?symbol=AAPL")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertTrue(data["success"])
    def test_live_tick_endpoint(self):
        payload = {
            "symbol": "AAPL",
            "current_price": 240.0,
            "candle": {"open": 239.5, "high": 240.5, "low": 239.0, "close": 240.0, "volume": 50000},
            "model": "Bobcat",
            "horizon": 10,
            "threshold": 60.0,
            "repredict": False
        }
        resp = self.client.post("/api/live-tick", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertTrue(data["success"])
        self.assertIn("price", data)
        self.assertIn("candle", data)
        self.assertIn("orderbook", data)


    def test_system_status_endpoint(self):
        resp = self.client.get("/api/system-status")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertTrue(data["success"])
        self.assertIn("model_cards", data)
        self.assertIn("disclaimers", data)
        self.assertIn("risk_engine", data)

    def test_risk_status_and_kill_switch_endpoints(self):
        resp = self.client.get("/api/risk/status")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertTrue(data["success"])
        self.assertIn("kill_switch_active", data["state"])

        # Trigger kill switch
        resp_ks = self.client.post("/api/risk/kill-switch", json={"reason": "Emergency drill"})
        self.assertEqual(resp_ks.status_code, 200)
        ks_data = json.loads(resp_ks.data)
        self.assertTrue(ks_data["kill_switch"]["kill_switch_active"])

        # Reset kill switch
        resp_rst = self.client.post("/api/risk/kill-switch/reset")
        self.assertEqual(resp_rst.status_code, 200)
        rst_data = json.loads(resp_rst.data)
        self.assertFalse(rst_data["state"]["kill_switch_active"])

    def test_propose_order_endpoint(self):
        payload = {
            "symbol": "AAPL",
            "side": "BUY",
            "qty": 5,
            "current_price": 220.0,
            "stop_loss": 210.0,
            "take_profit": 240.0
        }
        resp = self.client.post("/api/portfolio/propose-order", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertTrue(data["success"])
        self.assertIn("risk_check", data)
        self.assertIn("allowed", data["risk_check"])


if __name__ == "__main__":
    unittest.main()
