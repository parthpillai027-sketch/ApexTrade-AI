"""
Orderbook and Depth of Market (DoM) Simulation Engine.
Implements the normal distribution bell-curve liquidity placement algorithm
featured in Krafer's research for visualizing market micro-structure and buy/sell pressure.
"""

from typing import Dict, Any, List
import numpy as np


def generate_simulated_orderbook(
    current_price: float,
    recent_volume: float = 1000000.0,
    volatility: float = 0.015,
    levels: int = 15
) -> Dict[str, Any]:
    """
    Generate Depth of Market (DoM) orderbook with Gaussian order placement.
    
    Args:
        current_price: Latest asset price
        recent_volume: Average trading volume
        volatility: Asset price standard deviation
        levels: Number of bid and ask levels to generate
        
    Returns:
        Dictionary containing bids, asks, spread, imbalance ratio, and liquidity walls.
    """
    if current_price <= 0:
        current_price = 100.0

    # Spread scaling based on volatility
    spread_pct = max(0.0005, min(0.005, volatility * 0.15))
    half_spread = (current_price * spread_pct) / 2.0

    best_bid = current_price - half_spread
    best_ask = current_price + half_spread
    tick_size = max(0.01, round(current_price * 0.0004, 2))

    # Base volume per level
    base_qty = max(10.0, recent_volume / (levels * 250.0))

    # Bell-curve standard deviation in ticks
    sigma_ticks = levels * 0.65

    bids: List[Dict[str, Any]] = []
    asks: List[Dict[str, Any]] = []

    cum_bid_vol = 0.0
    cum_ask_vol = 0.0

    # Introduce subtle directional imbalance based on micro random walk
    bid_bias = np.random.uniform(0.85, 1.25)
    ask_bias = 2.1 - bid_bias

    # Generate Bid Side
    for i in range(levels):
        step_dist = (i + 1)
        price = round(best_bid - (step_dist * tick_size), 2)
        if price <= 0:
            break
        
        # Gaussian distribution density
        gaussian_factor = np.exp(-0.5 * ((step_dist / sigma_ticks) ** 2))
        noise = np.random.uniform(0.7, 1.4)
        
        # Occasional liquidity wall at key round number
        is_wall = (price % 5.0 == 0 or price % 10.0 == 0) and (i >= 3)
        wall_multiplier = 3.2 if is_wall else 1.0
        
        size = int(round(base_qty * gaussian_factor * noise * bid_bias * wall_multiplier))
        cum_bid_vol += size
        
        bids.append({
            "price": price,
            "size": size,
            "cum_size": int(cum_bid_vol),
            "is_wall": is_wall
        })

    # Generate Ask Side
    for i in range(levels):
        step_dist = (i + 1)
        price = round(best_ask + (step_dist * tick_size), 2)
        
        gaussian_factor = np.exp(-0.5 * ((step_dist / sigma_ticks) ** 2))
        noise = np.random.uniform(0.7, 1.4)
        
        is_wall = (price % 5.0 == 0 or price % 10.0 == 0) and (i >= 3)
        wall_multiplier = 3.2 if is_wall else 1.0
        
        size = int(round(base_qty * gaussian_factor * noise * ask_bias * wall_multiplier))
        cum_ask_vol += size
        
        asks.append({
            "price": price,
            "size": size,
            "cum_size": int(cum_ask_vol),
            "is_wall": is_wall
        })

    # Calculate depth percentages
    max_cum = max(cum_bid_vol, cum_ask_vol, 1.0)
    for b in bids:
        b["depth_pct"] = round((b["cum_size"] / max_cum) * 100.0, 1)
    for a in asks:
        a["depth_pct"] = round((a["cum_size"] / max_cum) * 100.0, 1)

    total_bid = sum(b["size"] for b in bids)
    total_ask = sum(a["size"] for a in asks)
    imbalance_ratio = total_bid / (total_ask + 1e-6)

    return {
        "is_simulated": True,
        "model_label": "Simulated Order Book (Gaussian DoM Model)",
        "disclaimer": "Simulated order distribution for educational and market microstructure visualization. Does not represent actual exchange liquidity.",
        "best_bid": best_bid,
        "best_ask": best_ask,
        "spread": round(best_ask - best_bid, 3),
        "spread_pct": round(((best_ask - best_bid) / current_price) * 100.0, 4),
        "total_bid_depth": int(total_bid),
        "total_ask_depth": int(total_ask),
        "imbalance_ratio": round(imbalance_ratio, 2),
        "bias": "Buy Pressure (Bid Heavy)" if imbalance_ratio > 1.15 else ("Sell Pressure (Ask Heavy)" if imbalance_ratio < 0.85 else "Balanced"),
        "bids": bids,
        "asks": asks
    }
