import pandas as pd

def create_ground_truth_template(input_csv, output_csv, sample_size=200):
    """
    Selects a random sample of data from the input CSV and creates a template for 
    building a ground truth dataset.
    """
    print(f"Reading data from {input_csv}...")
    df = pd.read_csv(input_csv)

    # Ensure the sample size is not larger than the dataset
    if len(df) < sample_size:
        sample_size = len(df)
        print(f"Warning: Sample size is larger than the dataset. Using {sample_size} instead.")

    print(f"Selecting {sample_size} random entries...")
    sample_df = df.sample(n=sample_size, random_state=42)  # Use a fixed random state for reproducibility

    # Add a new column for the correct category
    sample_df['correct_category'] = ''

    print(f"Saving template to {output_csv}...")
    sample_df.to_csv(output_csv, index=False)

    print("Ground truth template created successfully.")
    print(f"Please open {output_csv}, fill in the 'correct_category' column, and save it as 'ground_truth.csv'.")

if __name__ == '__main__':
    create_ground_truth_template('data/apod.csv', 'data/ground_truth_template.csv')
