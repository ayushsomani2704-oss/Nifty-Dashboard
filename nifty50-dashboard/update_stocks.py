"""
Daily stock data updater for the Nifty Dashboard.
Fetches real market data via yfinance and updates the JS data files.
Runs via GitHub Actions at 4:00 PM IST on weekdays.
"""

import yfinance as yf
import json
import re
import time
import os

# Paths to data files — script can be at repo root or inside nifty50-dashboard/
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Check if data files are in same directory or in a subfolder
if os.path.exists(os.path.join(BASE_DIR, "data-largecap.js")):
    DATA_DIR = BASE_DIR
elif os.path.exists(os.path.join(BASE_DIR, "nifty50-dashboard", "data-largecap.js")):
    DATA_DIR = os.path.join(BASE_DIR, "nifty50-dashboard")
else:
    DATA_DIR = BASE_DIR

DATA_FILES = {
    "largecap": os.path.join(DATA_DIR, "data-largecap.js"),
    "midcap": os.path.join(DATA_DIR, "data-midcap.js"),
    "smallcap": os.path.join(DATA_DIR, "data-smallcap.js"),
}


def parse_js_data(filepath):
    """Parse existing JS data file and return list of stock dicts."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    stocks = []
    pattern = r'\{\s*symbol:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*sector:\s*"([^"]+)",\s*basePrice:\s*([\d.]+),\s*pe:\s*([\d.]+),\s*pb:\s*([\d.]+),\s*roe:\s*([\d.]+),\s*de:\s*([\d.]+),\s*divYield:\s*([\d.]+)\s*\}'
    for match in re.finditer(pattern, content):
        stocks.append({
            "symbol": match.group(1),
            "name": match.group(2),
            "sector": match.group(3),
            "basePrice": float(match.group(4)),
            "pe": float(match.group(5)),
            "pb": float(match.group(6)),
            "roe": float(match.group(7)),
            "de": float(match.group(8)),
            "divYield": float(match.group(9)),
        })
    return stocks


def fetch_stock_data(symbols, batch_size=50, delay=3):
    """Fetch fundamental data from Yahoo Finance for Indian stocks."""
    results = {}
    nse_symbols = [s + ".NS" for s in symbols]

    # Batch price fetch
    print(f"Fetching prices for {len(symbols)} stocks...")
    try:
        price_data = yf.download(nse_symbols, period="1d", progress=False)
        if "Close" in price_data.columns or len(price_data) > 0:
            close = price_data["Close"] if "Close" in price_data else price_data[("Close",)]
            for sym in nse_symbols:
                col = sym if sym in close.columns else None
                if col and not close[col].empty:
                    val = close[col].iloc[-1]
                    if val == val:  # not NaN
                        results[sym.replace(".NS", "")] = {"basePrice": round(float(val), 2)}
    except Exception as e:
        print(f"Batch price fetch error: {e}")

    # Fetch fundamentals in batches
    print("Fetching fundamentals...")
    for i in range(0, len(nse_symbols), batch_size):
        batch = nse_symbols[i:i + batch_size]
        print(f"  Batch {i // batch_size + 1}/{(len(nse_symbols) + batch_size - 1) // batch_size}")

        for nse_sym in batch:
            sym = nse_sym.replace(".NS", "")
            retries = 3
            for attempt in range(retries):
                try:
                    ticker = yf.Ticker(nse_sym)
                    info = ticker.info
                    if not info or info.get("regularMarketPrice") is None:
                        break

                    data = results.get(sym, {})

                    # Price
                    price = info.get("currentPrice") or info.get("regularMarketPrice")
                    if price:
                        data["basePrice"] = round(float(price), 2)

                    # P/E
                    pe = info.get("trailingPE") or info.get("forwardPE")
                    if pe and pe > 0:
                        data["pe"] = round(float(pe), 1)

                    # P/B
                    pb = info.get("priceToBook")
                    if pb and pb > 0:
                        data["pb"] = round(float(pb), 2)

                    # ROE
                    roe = info.get("returnOnEquity")
                    if roe and roe != 0:
                        data["roe"] = round(float(roe) * 100, 1)

                    # Debt/Equity
                    de = info.get("debtToEquity")
                    if de is not None and de >= 0:
                        data["de"] = round(float(de) / 100, 2)

                    # Dividend Yield
                    dy = info.get("dividendYield")
                    if dy is not None and dy >= 0:
                        data["divYield"] = round(float(dy) * 100, 2)

                    results[sym] = data
                    break
                except Exception as e:
                    if attempt < retries - 1:
                        wait = (attempt + 1) * 5
                        print(f"    Retry {sym} in {wait}s: {e}")
                        time.sleep(wait)
                    else:
                        print(f"    Failed {sym}: {e}")

            time.sleep(0.5)  # Small delay between individual calls

        time.sleep(delay)  # Delay between batches

    return results


def update_stocks(stocks, fetched_data):
    """Merge fetched data into existing stocks, keeping old values as fallback."""
    updated = []
    update_count = 0

    for stock in stocks:
        sym = stock["symbol"]
        if sym in fetched_data:
            data = fetched_data[sym]
            new_stock = stock.copy()
            changed = False

            for key in ["basePrice", "pe", "pb", "roe", "de", "divYield"]:
                if key in data and data[key] > 0:
                    new_stock[key] = data[key]
                    changed = True

            if changed:
                update_count += 1
            updated.append(new_stock)
        else:
            updated.append(stock)

    return updated, update_count


def write_js_data(filepath, var_name, stocks):
    """Write stocks list back to JS data file."""
    lines = [f"const {var_name} = ["]
    for stock in stocks:
        line = (
            f'  {{ symbol: "{stock["symbol"]}", name: "{stock["name"]}", '
            f'sector: "{stock["sector"]}", basePrice: {stock["basePrice"]}, '
            f'pe: {stock["pe"]}, pb: {stock["pb"]}, roe: {stock["roe"]}, '
            f'de: {stock["de"]}, divYield: {stock["divYield"]} }},'
        )
        lines.append(line)
    lines.append("];")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    var_names = {
        "largecap": "LARGECAP_STOCKS",
        "midcap": "MIDCAP_STOCKS",
        "smallcap": "SMALLCAP_STOCKS",
    }

    for segment, filepath in DATA_FILES.items():
        print(f"\n{'='*50}")
        print(f"Processing {segment.upper()} ({filepath})")
        print(f"{'='*50}")

        if not os.path.exists(filepath):
            print(f"  File not found: {filepath}")
            continue

        stocks = parse_js_data(filepath)
        print(f"  Parsed {len(stocks)} stocks")

        if not stocks:
            print("  No stocks found in file, skipping")
            continue

        symbols = [s["symbol"] for s in stocks]
        fetched_data = fetch_stock_data(symbols)
        print(f"  Fetched data for {len(fetched_data)} stocks")

        updated_stocks, update_count = update_stocks(stocks, fetched_data)
        print(f"  Updated {update_count}/{len(stocks)} stocks")

        write_js_data(filepath, var_names[segment], updated_stocks)
        print(f"  Written to {filepath}")

    print("\nDone!")


if __name__ == "__main__":
    main()
