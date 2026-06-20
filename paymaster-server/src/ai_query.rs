use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct QueryRequest {
    pub query: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct QueryFilters {
    pub tx_type: Option<String>,
    pub min_amount: Option<u64>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

// 🔥 MOCK AI PARSER (replace later with OpenAI if needed)
#[allow(dead_code)]
pub fn parse_nl_query(input: &str) -> QueryFilters {
    let mut filters = QueryFilters {
        tx_type: None,
        min_amount: None,
        start_time: None,
        end_time: None,
    };

    let lower = input.to_lowercase();

    if lower.contains("soroban") {
        filters.tx_type = Some("soroban".to_string());
    }

    if lower.contains("last week") {
        filters.start_time = Some("last_week".to_string());
    }

    if lower.contains("100") {
        filters.min_amount = Some(100);
    }

    filters
}

//  MAIN HANDLER LOGIC
#[allow(dead_code)]
pub fn handle_ai_query(input: String) -> QueryFilters {
    let filters = parse_nl_query(&input);

    println!("🔍 AI Query Input: {}", input);
    println!("✅ Parsed Filters: {:?}", filters);

    //  Here later: call actual transaction query

    filters
}