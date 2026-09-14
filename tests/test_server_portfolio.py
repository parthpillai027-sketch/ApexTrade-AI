"""
Integration test for server.py portfolio endpoints.
"""

import unittest
from server import app, portfolio


class TestServerPortfolioEndpoints(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        portfolio.reset()

    def test_portfolio_summary_endpoint(self):
        res = self.app.get('/api/portfolio')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['portfolio']['cash'], 100000.0)

    def test_portfolio_order_and_close(self):
        order_data = {
            'symbol': 'AAPL',
            'side': 'BUY',
            'current_price': 180.0,
            'qty': 10,
            'stop_loss': 170.0,
            'take_profit': 200.0
        }
        res = self.app.post('/api/portfolio/order', json=order_data)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        pos_id = data['position']['id']

        res_p = self.app.get('/api/portfolio?symbol=AAPL&price=190')
        self.assertEqual(res_p.status_code, 200)
        p_data = res_p.get_json()
        self.assertEqual(len(p_data['portfolio']['open_positions']), 1)
        self.assertEqual(p_data['portfolio']['open_positions'][0]['unrealized_pnl'], 100.0)

        close_data = {
            'pos_id': pos_id,
            'current_price': 195.0,
            'reason': 'Target reached'
        }
        res_c = self.app.post('/api/portfolio/close', json=close_data)
        self.assertEqual(res_c.status_code, 200)
        c_data = res_c.get_json()
        self.assertTrue(c_data['success'])
        self.assertEqual(c_data['trade']['realized_pnl'], 150.0)

    def test_toggle_auto_pilot_and_reset(self):
        res = self.app.post('/api/portfolio/auto-pilot', json={'enabled': True})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()['auto_pilot'])

        res_r = self.app.post('/api/portfolio/reset')
        self.assertEqual(res_r.status_code, 200)
        self.assertFalse(res_r.get_json()['portfolio']['auto_pilot'])


if __name__ == '__main__':
    unittest.main()
