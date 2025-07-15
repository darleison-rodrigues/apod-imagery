import os
import csv
import requests
import time
from datetime import date, timedelta
from dotenv import load_dotenv
import random
from typing import Set, Optional, Dict, Any

# Load environment variables from .env file
load_dotenv()

# --- CONFIGURATION ---
NASA_API_KEY = os.getenv("NASA_API_KEY", "DEMO_KEY")
if NASA_API_KEY == "DEMO_KEY":
    print("Warning: NASA_API_KEY not found. Using DEMO_KEY, which has rate limits.")

START_DATE = date(1995, 6, 16)  # The first day of APOD
# START_DATE = date(2023, 1, 1) # Use for testing a smaller date range
END_DATE = date.today()
OUTPUT_CSV_PATH = "data/apod_master_data.csv"
FIELDNAMES = ['date', 'title', 'explanation', 'url', 'hdurl', 'media_type', 'copyright']

# Rate limiting configuration
BASE_DELAY = 1.0  # Base delay between requests
MAX_DELAY = 300   # Maximum delay (5 minutes)
RETRY_ATTEMPTS = 5
BATCH_SIZE = 50   # Process in batches to save progress more frequently

class RateLimiter:
    """Handles rate limiting with exponential backoff and jitter."""
    
    def __init__(self, base_delay: float = 1.0, max_delay: float = 300):
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.consecutive_429s = 0
        self.last_request_time = 0
    
    def wait_before_request(self):
        """Wait appropriate time before making next request."""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        # Calculate delay based on consecutive 429s
        if self.consecutive_429s > 0:
            delay = min(self.base_delay * (2 ** self.consecutive_429s), self.max_delay)
            # Add jitter to prevent thundering herd
            delay += random.uniform(0, delay * 0.1)
        else:
            delay = self.base_delay
        
        # Ensure minimum time between requests
        if time_since_last < delay:
            sleep_time = delay - time_since_last
            time.sleep(sleep_time)
        
        self.last_request_time = time.time()
    
    def handle_429(self):
        """Handle rate limit response."""
        self.consecutive_429s += 1
        delay = min(self.base_delay * (2 ** self.consecutive_429s), self.max_delay)
        print(f"Rate limit hit. Waiting {delay:.1f} seconds (attempt {self.consecutive_429s})...")
        time.sleep(delay)
    
    def reset_429_counter(self):
        """Reset counter after successful request."""
        self.consecutive_429s = 0

def get_existing_dates(file_path: str) -> Set[str]:
    """Reads a CSV file and returns a set of dates already processed."""
    if not os.path.exists(file_path):
        return set()
    
    try:
        with open(file_path, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            return {row['date'] for row in reader if row.get('date')}
    except Exception as e:
        print(f"Error reading existing data: {e}")
        return set()

def fetch_apod_data(api_date: str, rate_limiter: RateLimiter, session: requests.Session) -> Optional[Dict[str, Any]]:
    """Fetches APOD data for a single date from the NASA API with improved rate limit handling."""
    api_url = f"https://api.nasa.gov/planetary/apod?api_key={NASA_API_KEY}&date={api_date}"
    
    for attempt in range(RETRY_ATTEMPTS):
        try:
            rate_limiter.wait_before_request()
            response = session.get(api_url, timeout=30)
            
            if response.status_code == 200:
                rate_limiter.reset_429_counter()
                return response.json()
            elif response.status_code == 429:
                rate_limiter.handle_429()
                continue
            elif response.status_code == 404:
                print(f"No APOD data available for {api_date} (404)")
                return None
            else:
                print(f"HTTP {response.status_code} for {api_date}: {response.text[:100]}")
                if attempt < RETRY_ATTEMPTS - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff for other errors
                    continue
                return None
                
        except requests.exceptions.Timeout:
            print(f"Timeout for {api_date}, attempt {attempt + 1}")
            if attempt < RETRY_ATTEMPTS - 1:
                time.sleep(2 ** attempt)
                continue
        except requests.exceptions.ConnectionError as e:
            print(f"Connection error for {api_date}: {e}")
            if attempt < RETRY_ATTEMPTS - 1:
                time.sleep(5)  # Wait longer for connection issues
                continue
        except requests.exceptions.RequestException as e:
            print(f"Request error for {api_date}: {e}")
            if attempt < RETRY_ATTEMPTS - 1:
                time.sleep(2 ** attempt)
                continue
    
    print(f"Failed to fetch data for {api_date} after {RETRY_ATTEMPTS} attempts")
    return None

def daterange(start_date: date, end_date: date):
    """Generator for iterating through a range of dates."""
    for n in range(int((end_date - start_date).days) + 1):
        yield start_date + timedelta(n)

def write_batch_to_csv(batch_data: list, file_path: str, write_header: bool = False):
    """Write a batch of data to CSV file."""
    mode = 'w' if write_header else 'a'
    with open(file_path, mode, newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        if write_header:
            writer.writeheader()
        writer.writerows(batch_data)

def create_master_dataset():
    """
    Iterates through a date range, fetches data from the NASA APOD API,
    and saves it to a master CSV file. Skips dates that are already present.
    """
    # Create data directory if it doesn't exist
    os.makedirs(os.path.dirname(OUTPUT_CSV_PATH), exist_ok=True)

    existing_dates = get_existing_dates(OUTPUT_CSV_PATH)
    print(f"Found {len(existing_dates)} existing entries. Resuming download.")

    # Calculate dates to process
    all_dates = list(daterange(START_DATE, END_DATE))
    dates_to_process = [d for d in all_dates if d.strftime("%Y-%m-%d") not in existing_dates]
    
    if not dates_to_process:
        print("All dates already processed!")
        return

    print(f"Need to process {len(dates_to_process)} dates out of {len(all_dates)} total dates.")

    # Initialize rate limiter and session
    rate_limiter = RateLimiter(BASE_DELAY, MAX_DELAY)
    session = requests.Session()
    
    # Set up session with connection pooling
    session.headers.update({
        'User-Agent': 'NASA-APOD-Downloader/1.0',
        'Accept': 'application/json'
    })

    batch_data = []
    processed_count = 0
    failed_dates = []

    try:
        for single_date in dates_to_process:
            date_str = single_date.strftime("%Y-%m-%d")
            
            print(f"Fetching data for {date_str} ({processed_count + 1}/{len(dates_to_process)})...")
            data = fetch_apod_data(date_str, rate_limiter, session)

            if data:
                # Ensure all fields are present, providing defaults if not
                row_data = {field: data.get(field, '') for field in FIELDNAMES}
                batch_data.append(row_data)
            else:
                failed_dates.append(date_str)
            
            processed_count += 1
            
            # Write batch to file periodically
            if len(batch_data) >= BATCH_SIZE:
                write_batch_to_csv(batch_data, OUTPUT_CSV_PATH, write_header=(not existing_dates and processed_count <= BATCH_SIZE))
                print(f"Saved batch of {len(batch_data)} records to {OUTPUT_CSV_PATH}")
                batch_data = []

        # Write remaining data
        if batch_data:
            write_batch_to_csv(batch_data, OUTPUT_CSV_PATH, write_header=(not existing_dates and processed_count <= len(batch_data)))
            print(f"Saved final batch of {len(batch_data)} records to {OUTPUT_CSV_PATH}")

    except KeyboardInterrupt:
        print("\nInterrupted by user. Saving progress...")
        if batch_data:
            write_batch_to_csv(batch_data, OUTPUT_CSV_PATH)
            print(f"Saved {len(batch_data)} records before interruption")
    
    finally:
        session.close()

    # Summary
    total_existing = len(existing_dates)
    total_new = processed_count - len(failed_dates)
    print(f"\nSummary:")
    print(f"- Existing records: {total_existing}")
    print(f"- New records added: {total_new}")
    print(f"- Failed requests: {len(failed_dates)}")
    print(f"- Total records: {total_existing + total_new}")
    
    if failed_dates:
        print(f"\nFailed dates: {', '.join(failed_dates[:10])}")
        if len(failed_dates) > 10:
            print(f"... and {len(failed_dates) - 10} more")

    print(f"\nMaster data file saved to {OUTPUT_CSV_PATH}")

if __name__ == '__main__':
    create_master_dataset()