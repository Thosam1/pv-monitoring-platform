# Recovery Subgraph

Detailed flow diagram for the recovery subgraph: handling data errors with date selection, alternative suggestions, and error explanation.

## Main Flow

```mermaid
flowchart TB
    START((START))

    subgraph Detection["Error Detection"]
        DET["detect_recovery_type node"]
        STATUS{{"Tool status?"}}
    end

    subgraph NoDataWindow["No Data in Window Recovery"]
        NDW["no_data_in_window"]
        EXT["extract_available_range"]
        DATE["prompt_date_selection"]
        PICK["request_user_selection<br/>(date picker)"]
        RETRY["retry_with_date"]
    end

    subgraph NoData["No Data Recovery"]
        ND["no_data"]
        ALT["suggest_alternatives"]
        LIST["list_loggers()"]
        OTHER["Show alternative loggers<br/>or suggest upload"]
    end

    subgraph Error["Error Recovery"]
        ERR["error"]
        EXP["explain_error"]
        MSG["User-friendly error message"]
    end

    subgraph Guard["Recovery Guard"]
        CHECK{{"recoveryAttempts < 3?"}}
        INC["Increment attempts"]
        FAIL["Max attempts exceeded"]
    end

    END_FLOW["Return to flow"]
    END_NODE((END))

    START --> DET
    DET --> STATUS

    STATUS -->|"no_data_in_window"| NDW
    STATUS -->|"no_data"| ND
    STATUS -->|"error"| ERR

    NDW --> CHECK
    CHECK -->|"Yes"| INC
    CHECK -->|"No"| FAIL
    INC --> EXT
    EXT --> DATE
    DATE --> PICK
    PICK -->|"user selects"| RETRY
    RETRY --> END_FLOW

    ND --> ALT
    ALT --> LIST
    LIST --> OTHER
    OTHER --> END_NODE

    ERR --> EXP
    EXP --> MSG
    MSG --> END_NODE

    FAIL --> END_NODE

    style START fill:#22c55e,stroke:#16a34a,color:#fff
    style END_NODE fill:#ef4444,stroke:#dc2626,color:#fff
    style END_FLOW fill:#3b82f6,stroke:#2563eb,color:#fff
    style NDW fill:#f59e0b,stroke:#d97706,color:#fff
    style ND fill:#f59e0b,stroke:#d97706,color:#fff
    style ERR fill:#ef4444,stroke:#dc2626,color:#fff
    style FAIL fill:#ef4444,stroke:#dc2626,color:#fff
```

## Sequence Diagram - Date Selection Recovery

```mermaid
sequenceDiagram
    participant F as Flow
    participant T as Tool
    participant R as RecoverySubgraph
    participant FE as Frontend
    participant U as User

    F->>T: get_power_curve("925", "2025-01-15")
    T-->>F: { status: "no_data_in_window",<br/>availableRange: { start: "2024-12-01", end: "2025-01-10" } }

    rect rgb(254, 243, 199)
        Note over F,R: Enter Recovery
        F->>R: detect_recovery_type()
        R->>R: Check recoveryAttempts (0 < 3) ✓
        R->>R: Increment to 1
    end

    rect rgb(219, 234, 254)
        Note over R,FE: Date Selection
        R->>FE: request_user_selection({<br/>  inputType: "date",<br/>  minDate: "2024-12-01",<br/>  maxDate: "2025-01-10"<br/>})
        FE-->>U: Show date picker
        U->>FE: Select "2025-01-05"
        FE->>R: selectedDate = "2025-01-05"
    end

    rect rgb(220, 252, 231)
        Note over R,F: Retry with New Date
        R->>F: Update flowContext.selectedDate
        R->>F: Return to flow
    end

    F->>T: get_power_curve("925", "2025-01-05")
    T-->>F: { status: "ok", result: {...} }
```

## Recovery Types

### no_data_in_window

Data exists for the logger, but not in the requested date range.

```mermaid
flowchart LR
    subgraph Input["Tool Response"]
        RESP["status: 'no_data_in_window'<br/>message: 'No data for Jan 15'<br/>availableRange: Dec 1 - Jan 10"]
    end

    subgraph Action["Recovery Action"]
        UI["Date Picker"]
        HINT["flowHint: 'Will retry<br/>with selected date'"]
        SKIP["skipOption: 'Use latest<br/>available (Jan 10)'"]
    end

    subgraph Result["Outcome"]
        NEW["New date in flowContext"]
        RETRY["Retry original tool"]
    end

    Input --> Action --> Result

    style Input fill:#f59e0b,stroke:#d97706
    style Action fill:#3b82f6,stroke:#2563eb
    style Result fill:#22c55e,stroke:#16a34a
```

### no_data

Logger has no data at all in the database.

```mermaid
flowchart LR
    subgraph Input["Tool Response"]
        RESP["status: 'no_data'<br/>message: 'Logger has no data'"]
    end

    subgraph Action["Recovery Action"]
        LIST["list_loggers()"]
        ALT["Show alternatives"]
        UPLOAD["Suggest upload"]
    end

    subgraph Result["Outcome"]
        MSG["'Try these loggers<br/>or upload data'"]
        END_CONV["End conversation"]
    end

    Input --> Action --> Result

    style Input fill:#f59e0b,stroke:#d97706
    style Action fill:#3b82f6,stroke:#2563eb
    style Result fill:#ef4444,stroke:#dc2626
```

### error

Tool execution failed due to system error.

```mermaid
flowchart LR
    subgraph Input["Tool Response"]
        RESP["status: 'error'<br/>message: 'Database timeout'"]
    end

    subgraph Action["Recovery Action"]
        EXP["explain_error node"]
        FRIENDLY["Convert to user-friendly<br/>message"]
    end

    subgraph Result["Outcome"]
        MSG["'I encountered an issue<br/>retrieving data. Please try again.'"]
        RETRY["Offer retry option"]
    end

    Input --> Action --> Result

    style Input fill:#ef4444,stroke:#dc2626
    style Action fill:#3b82f6,stroke:#2563eb
    style Result fill:#f59e0b,stroke:#d97706
```

## Recovery Guard

Prevents infinite retry loops:

```mermaid
flowchart TB
    subgraph State["State Check"]
        ATT["recoveryAttempts"]
        CHECK{{"< 3?"}}
    end

    subgraph Allow["Attempt Allowed"]
        INC["recoveryAttempts++"]
        PROC["Proceed to recovery"]
    end

    subgraph Block["Attempt Blocked"]
        RESET["recoveryAttempts = 0"]
        EXIT["Exit with error message"]
    end

    ATT --> CHECK
    CHECK -->|"Yes (0, 1, 2)"| Allow
    CHECK -->|"No (>= 3)"| Block

    style Allow fill:#22c55e,stroke:#16a34a
    style Block fill:#ef4444,stroke:#dc2626
```

## Date Selection UI

```mermaid
flowchart TB
    subgraph DatePicker["Date Selection Component"]
        PROMPT["No data available for January 15.<br/>Please select a date within the available range:"]

        subgraph Picker["Date Picker"]
            MIN["Min: December 1, 2024"]
            MAX["Max: January 10, 2025"]
            CAL["📅 Calendar Widget"]
        end

        subgraph FlowHint["Flow Hint"]
            NEXT["Will retry the analysis<br/>with your selected date"]
            SKIP["Quick option: Use latest<br/>available (January 10)"]
        end
    end

    style PROMPT fill:#f59e0b,stroke:#d97706
    style SKIP fill:#d1fae5,stroke:#10b981
```

## State Updates

After recovery completes:

```typescript
// Before recovery
flowContext: {
  selectedLoggerId: "925",
  selectedDate: "2025-01-15"  // Invalid date
}

// After recovery (date selection)
flowContext: {
  selectedLoggerId: "925",
  selectedDate: "2025-01-05",  // Valid date from user
  toolResults: {
    needsRecovery: false
  }
}
recoveryAttempts: 1  // Incremented
```
