# Production-Safe Dynamic Oracle Package Forecast XML Parser
## Audit, Generalization, Validation & Zero-Regression Hardening

### CONTEXT

You are working on an existing **LIVE production Breakfast Check-In system** used by real hotel staff and real guests.

The system receives an **Oracle Reports Package Forecast XML** and uses it to power the breakfast operation:

```text
Oracle Package Forecast XML
        ↓
Parse reservations / packages
        ↓
Breakfast forecast
        ↓
Host searches room
        ↓
Guest/reservation verification
        ↓
Breakfast check-in
        ↓
Table assignment
        ↓
Live operational statistics
```

The system is already running in production.

Therefore:

> **DO NOT rebuild the application.**
>
> **DO NOT break the existing workflow.**
>
> **DO NOT assume today's data will be the same tomorrow.**

The attached XML:

`pkgforecast_23994069.XML`

is a **REAL REFERENCE SAMPLE**, not a permanent data definition.

---

# 1. THE MOST IMPORTANT REQUIREMENT

The XML file changes every day.

The following can change from one day to another:

- Forecast date
- Number of reservations
- Number of rooms
- Room numbers
- Room types
- Guest names
- Confirmation numbers
- Arrival dates
- Departure dates
- Reservation statuses
- Adult counts
- Child counts
- Rate codes
- Package codes
- Number of package codes
- Package combinations
- Package quantities
- Package descriptions
- Number of records
- Number of product groups
- Oracle report ID
- Other Oracle-generated identifiers

Therefore:

## NEVER hardcode today's values.

For example, production code must NEVER assume:

```text
BFAIN
BFCIN
BFAAD
UPSBB1
WEB_BFSA
```

will always exist.

Likewise, NEVER assume:

```text
186
17
192
209
```

will exist tomorrow.

These values are only characteristics of the supplied reference XML.

---

# 2. WHAT WE ACTUALLY WANT TO BUILD

The system must understand the **structure and semantics of the Oracle XML**, not memorize the current data.

Think of the parser as:

```text
Oracle XML Schema / Structure
          ↓
Dynamic Interpretation
          ↓
Today's Actual Data
```

NOT:

```text
Today's XML
          ↓
Hardcoded assumptions
```

---

# 3. GOLDEN PRINCIPLE

The parser should answer:

> "What does THIS XML say?"

not:

> "What did yesterday's XML look like?"

Every import must be based on the actual XML received for that day.

---

# 4. DYNAMIC PACKAGE HANDLING

The parser must discover package/product codes dynamically.

If today's XML contains:

```text
BFAIN
BFCIN
BFAAD
```

process those.

If tomorrow it contains:

```text
NEWPKG1
NEWPKG2
WEB_BFSC
```

the parser must still process them without requiring a code deployment simply because the package list changed.

Do NOT hardcode a fixed package list.

---

# 5. PACKAGE MEANINGS MUST COME FROM THE XML WHEN AVAILABLE

The XML contains:

```xml
<PRODUCT_ID1>BFAAD</PRODUCT_ID1>
<PRODUCT_DESC>Breakfast Adult Add On Package</PRODUCT_DESC>
```

The parser should preserve both:

```text
package_code = BFAAD
package_description = Breakfast Adult Add On Package
```

The description is the authoritative semantic information provided by the report.

Do not rely solely on a hardcoded mapping such as:

```text
BFAAD = Adult
```

when the XML itself provides:

```text
PRODUCT_DESC
```

Instead, build a dynamic interpretation layer.

---

# 6. DO NOT ASSUME PACKAGE CODE FORMAT

Never assume package codes follow:

```text
BFA...
BFC...
WEB...
UPS...
```

These are examples from this particular report.

Future Oracle configuration may contain completely different codes.

The parser must treat package codes as dynamic Oracle identifiers.

---

# 7. SEPARATE PACKAGE IDENTIFICATION FROM PACKAGE CLASSIFICATION

This is extremely important.

The parser should have two separate concepts:

### Package identity

```text
product_id
```

Example:

```text
BFAIN
```

### Package meaning/classification

Derived from available Oracle information such as:

```text
PRODUCT_DESC
PRODUCTS
ADULTS
CHILDREN
PKG_QTY
QUANTITY
PERSONS
CALCULATION_RULE
```

Do not permanently encode today's package codes into the parser.

If classification cannot be determined reliably:

```text
classification = UNKNOWN
```

is better than guessing.

---

# 8. DYNAMIC RESERVATION PARSING

Every:

```xml
<G_RESV_DETAILS>
```

must be treated as a reservation/package detail record according to its surrounding XML context.

Do not assume a fixed number of records.

Do not assume a fixed number of pages.

Do not assume a fixed number of rooms.

Do not assume a fixed number of packages.

---

# 9. PRESERVE XML CONTEXT

Because the XML is hierarchical, context matters.

For example:

```text
G_PRODUCT_GROUP
    ↓
PRODUCT_ID1
PRODUCT_DESC
    ↓
LIST_G_RESV_DETAILS
    ↓
G_RESV_DETAILS
```

A reservation record inherits important context from its surrounding product group.

The parser must preserve this relationship.

Do NOT flatten the XML too early and lose the parent package context.

---

# 10. DYNAMIC FORECAST DATE

Never hardcode:

```text
2026-08-30
```

The forecast date must be read from:

```xml
<G_STAY_DATE>
    <STAY_DATE>
```

and/or the corresponding stay-date field in reservation details.

The system must dynamically determine the forecast/business date from the imported XML.

If tomorrow's XML says:

```text
31-AUG-26
```

the system must automatically operate on:

```text
2026-08-31
```

without code changes.

---

# 11. DYNAMIC REPORT ID

Do not hardcode:

```text
81141561
```

The XML provides:

```xml
<REPORT_ID>
```

and:

```xml
<REPORT_ID1>
```

These are generated report identifiers.

The parser must read them dynamically.

---

# 12. DYNAMIC ROOM DATA

Never assume the current rooms.

Today's XML may contain:

```text
0605
0616
0502
```

Tomorrow may contain completely different rooms.

The parser must simply read:

```xml
<ROOM>
```

from the current XML.

Room number is data, not configuration.

---

# 13. DYNAMIC GUEST DATA

Never hardcode or assume guest names.

Read dynamically:

```text
GUEST_NAME
GUEST_FIRST_NAME
DISPLAY_NAME
GUEST_NAME_ID
```

Preserve the existing UI behavior for displaying the guest.

---

# 14. DYNAMIC ADULT / CHILD COUNTS

Never assume the number of adults or children.

Read:

```text
ADULTS
CHILDREN
```

as dynamic numeric values.

Possible examples tomorrow:

```text
ADULTS = 1
CHILDREN = 0
```

or:

```text
ADULTS = 2
CHILDREN = 2
```

or:

```text
ADULTS = 3
CHILDREN = 1
```

The parser must support all valid values.

---

# 15. DYNAMIC PACKAGE QUANTITY

Do not assume:

```text
PKG_QTY = 1
```

Do not assume:

```text
PKG_QTY = ADULTS
```

Do not assume:

```text
QUANTITY = ADULTS
```

The XML explicitly provides:

```text
PKG_QTY
QUANTITY
PERSONS
NO_OF_ROOMS
CALCULATION_RULE
TOTAL_PKGS1
```

The parser must preserve all of these.

The business/statistics layer must determine which quantity represents the package forecast according to Oracle's structure and report semantics.

Do not invent a universal rule unless validated.

---

# 16. IMPORTANT: PACKAGE QUANTITY MUST BE DATA-DRIVEN

For every package detail, create a normalized representation similar to:

```json
{
  "package_code": "...",
  "package_description": "...",
  "pkg_qty": null,
  "quantity": null,
  "persons": null,
  "adults": null,
  "children": null,
  "rooms": null,
  "calculation_rule": "...",
  "raw_products": "..."
}
```

Do not discard the raw Oracle values.

---

# 17. MULTIPLE PACKAGE CODES

A reservation may contain:

```text
PRODUCTS = "BFAIN,BFCIN"
```

or another combination tomorrow.

The parser must support arbitrary comma-separated package/product values.

Do not assume only two codes.

Do not assume the order.

Do not assume today's combinations will remain tomorrow.

---

# 18. SUMMARY SECTION VS DETAIL SECTION

The XML contains:

```text
LIST_G_SUMTOTAL_PKGS
```

and:

```text
LIST_G_PRODUCT_GROUP
```

These represent different levels of information.

The parser must distinguish:

### Oracle summary/forecast data

from:

### Reservation/package detail data

Never count both as separate reservations.

Never add summary records to reservation counts.

---

# 19. DYNAMIC SUMMARY EXTRACTION

The summary structure:

```text
LIST_G_SUMTOTAL_PKGS
    ↓
G_STAY_DATE
    ↓
G_PRODUCT_ID
    ↓
PRODUCT_ID
    ↓
G_REPORT_ID
    ↓
TOTAL_PKGS
```

must be parsed dynamically.

For each actual product/package found in the XML:

```text
product_id
reported_total
```

should be extracted.

Do not assume the number of products.

Do not assume product names.

Do not assume product codes.

---

# 20. RECONCILIATION MUST BE DYNAMIC

For every imported XML:

```text
Oracle Summary
       VS
Calculated Detail
```

must be compared dynamically.

Do NOT compare only:

```text
BFAIN
BFCIN
```

because tomorrow those packages may not exist.

Instead:

```text
UNION(all package codes found in summary and details)
```

then compare each code.

Example:

```text
Package A
Oracle = X
Calculated = Y

Package B
Oracle = X
Calculated = Y

Package C
Oracle = X
Calculated = Y
```

The package list is discovered from the XML.

---

# 21. NO HARDCODED EXPECTED TOTALS IN PRODUCTION

Never write:

```text
BFAIN = 186
BFCIN = 17
TOTAL = 209
```

into production code.

Those values belong only to the reference regression test.

Production must calculate the values dynamically from the current XML.

---

# 22. THE REFERENCE XML IS A STRUCTURAL FIXTURE

Use:

`pkgforecast_23994069.XML`

to verify:

- XML hierarchy
- field extraction
- parent/child relationships
- quantity interpretation
- package grouping
- summary/detail reconciliation
- reservation identity
- room lookup
- guest lookup

But DO NOT use it to define permanent business constants.

---

# 23. CREATE MULTIPLE SYNTHETIC TEST SCENARIOS

Because the XML changes daily, the test suite must not only test today's exact data.

Create synthetic variations of the XML structure or fixture data representing:

### Scenario A

Different forecast date.

### Scenario B

Different room numbers.

### Scenario C

Different number of reservations.

### Scenario D

Different package codes.

### Scenario E

Additional package code.

### Scenario F

Package code removed.

### Scenario G

New package description.

### Scenario H

Different adult/child quantities.

### Scenario I

Reservation with zero children.

### Scenario J

Reservation with multiple children.

### Scenario K

Reservation with multiple package codes.

### Scenario L

Different reservation statuses.

### Scenario M

Long-stay guest.

### Scenario N

Duplicate room number across records.

### Scenario O

Same guest with multiple reservations.

### Scenario P

Empty optional XML values.

### Scenario Q

Unknown/new package code.

The parser must remain functional.

---

# 24. PROPERTY-BASED / INVARIANT TESTING

Where practical, add tests for invariants rather than only fixed numbers.

For example:

### Invariant 1

Changing the room number in the XML must change the imported room number but must NOT change package totals.

### Invariant 2

Changing the guest name must change the guest name but must NOT change forecast totals.

### Invariant 3

Changing the forecast date must change the business date but must NOT require code modification.

### Invariant 4

Adding a valid package to the XML must cause that package to appear dynamically.

### Invariant 5

Removing a package must cause it to disappear from the daily forecast.

### Invariant 6

Changing package quantities must change calculated totals accordingly.

### Invariant 7

Importing the same XML twice must not double the forecast.

---

# 25. DO NOT USE PAGE-BASED LOGIC

The XML is not a PDF.

Never use logic such as:

```text
page 1
page 2
page 3
```

to determine reservations.

The XML structure is authoritative.

---

# 26. DO NOT USE LINE-NUMBER LOGIC

Never depend on:

```text
line 123
line 456
```

or element positions in the raw XML text.

Use XML element names and hierarchy.

---

# 27. DO NOT DEPEND ON RECORD ORDER

Do not assume:

```text
BFAIN always appears first
BFCIN always appears second
```

or:

```text
rooms are always sorted
```

or:

```text
package groups always appear in the same order
```

The parser must be order-independent wherever XML semantics allow.

---

# 28. UNKNOWN FIELDS / FUTURE ORACLE CHANGES

Oracle may add fields in future exports.

The parser should ignore unknown optional fields safely rather than failing unnecessarily.

However, if a structural change prevents reliable interpretation:

```text
IMPORT_VALIDATION_FAILED
```

should be generated rather than silently importing incorrect data.

---

# 29. XML NAMESPACE ROBUSTNESS

The current file may not use namespaces.

However, implement XML parsing in a way that does not unnecessarily break if Oracle introduces a namespace in a future export.

Do not over-engineer this if the current parser already handles it correctly.

---

# 30. EMPTY VS ZERO

These are different:

```xml
<CHILDREN>0</CHILDREN>
```

and:

```xml
<CHILDREN></CHILDREN>
```

The parser must preserve the distinction.

Do not convert empty values into arbitrary numbers.

---

# 31. RESERVATION IDENTITY

Do not use:

```text
room number
```

as the sole unique identifier.

Use the existing reliable Oracle identifiers such as:

```text
CONFIRMATION_NO
RESV_NAME_ID
GUEST_NAME_ID
NUMBER1
```

according to the existing architecture.

The correct identity strategy must be documented.

---

# 32. CHECK-IN DATA MUST REMAIN SEPARATE

The imported Oracle forecast is source data.

The host's check-in is operational data.

Do not modify Oracle forecast quantities when a host checks in a guest.

Maintain:

```text
Forecast
Checked In
Remaining
```

separately.

---

# 33. TABLE ASSIGNMENT MUST REMAIN SEPARATE

Table assignment is operational state.

It must not alter:

```text
Oracle package quantity
```

or:

```text
forecast quantity
```

---

# 34. DAILY IMPORT MUST BE SAFE

Every day a new XML may arrive.

The import process must:

1. Identify the forecast/business date.
2. Identify the report/source.
3. Parse the current XML.
4. Validate its structure.
5. Extract current package/product groups.
6. Extract current reservations.
7. Calculate current statistics.
8. Reconcile against Oracle summary.
9. Only then commit the import.
10. Preserve previous operational check-in data according to the application's existing business rules.

Do not assume tomorrow's XML resembles today's data beyond the Oracle structural schema.

---

# 35. IMPORTANT: DO NOT DELETE YESTERDAY'S DATA BLINDLY

Because this is a live operational system, determine how the current application handles historical dates.

Do not introduce:

```text
DELETE ALL BREAKFAST DATA
```

or:

```text
TRUNCATE
```

during daily import.

Historical records and today's operational records must be protected.

---

# 36. IDEMPOTENCY

The same XML can potentially be uploaded again.

The system must recognize duplicate imports using an appropriate source identity such as:

```text
file hash
report ID
forecast date
report type
```

or the existing application's equivalent.

Do not duplicate reservations or forecast quantities.

---

# 37. SHADOW MODE BEFORE PRODUCTION CHANGE

Because the system is live:

First implement the improved parser/calculation logic in a comparison/shadow path where possible.

Compare:

```text
CURRENT PRODUCTION RESULT
VS
IMPROVED RESULT
```

without changing live behavior.

Generate a diff:

```text
Reservations:
same / different

Package totals:
same / different

Adults:
same / different

Children:
same / different

Rooms:
same / different

Statuses:
same / different
```

Only activate the improved path after the differences are understood and verified.

---

# 38. DO NOT FORCE ZERO-DIFFERENCE WHERE THE OLD PARSER IS WRONG

If the current parser says:

```text
BFAIN = 180
```

and the improved Oracle-aware parser says:

```text
BFAIN = 186
```

do not modify the improved parser merely to match the old production behavior.

Determine why the difference exists.

The goal is:

```text
Correct Oracle interpretation
+
No unintended regression
```

not:

```text
Preserve every old bug
```

---

# 39. DATABASE SAFETY

Before changing schema:

- inspect all consumers
- inspect production migrations
- inspect API contracts
- inspect frontend dependencies
- determine whether the field already exists
- prefer additive changes
- avoid destructive migrations
- avoid renaming existing fields unless absolutely necessary

If no schema change is required, do not create one.

---

# 40. TEST THE REAL XML FIRST

Use the supplied file:

`pkgforecast_23994069.XML`

as the first regression fixture.

Verify that the existing system can parse it correctly.

Do not assume the expected output.

Derive the expected output from the XML itself and Oracle summary/detail reconciliation.

---

# 41. REFERENCE FILE EXPECTED VALIDATION

For this specific supplied XML/report date:

```text
Forecast Date = 30-AUG-26
```

The Oracle summary contains these active product codes:

```text
BFAAD
BFAIN
BFCIN
UPSBB1
WEB_BFSA
```

and the known reference totals are:

```text
BFAAD    = 2
BFAIN    = 186
BFCIN    = 17
UPSBB1   = 1
WEB_BFSA = 3

TOTAL = 209
```

These values are ONLY a regression fixture.

They must NOT become production constants.

---

# 42. REFERENCE FILE MUST ALSO TEST SEMANTIC EXTRACTION

For example, the XML contains:

```text
PRODUCT_ID1 = BFAAD
PRODUCT_DESC = Breakfast Adult Add On Package
```

and a reservation containing:

```text
CONFIRMATION_NO = 599594699
ADULTS = 1
CHILDREN = 0
PKG_QTY = 1
QUANTITY = 1
PERSONS = 1
ROOM = 0605
ROOM_CATEGORY_LABEL = D1K
RES_STATUS = CKIN
RATE_CODE = BNB
PRODUCTS = BFAAD,BFCAD
```

These fields must be mapped correctly without confusing:

```text
PRODUCT_ID
PRODUCTS
ROOM
ROOM_CATEGORY
RATE_CODE
RES_STATUS
```

The XML explicitly provides these values.

---

# 43. ANOTHER REFERENCE CASE

The XML contains a BFAIN record where:

```text
ADULTS = 2
CHILDREN = 0
PKG_QTY = 2
QUANTITY = 2
PERSONS = 2
```

This demonstrates why quantity fields must be preserved and tested rather than assuming every package always equals one person.

---

# 44. REQUIRED NORMALIZED DOMAIN MODEL

Without unnecessarily changing the current database, define/document a normalized conceptual model:

```text
Forecast
 ├── business_date
 ├── report_id
 ├── source_file
 └── package_totals[]

Package
 ├── code
 ├── description
 └── raw_metadata

Reservation
 ├── confirmation_no
 ├── reservation_id
 ├── guest_id
 ├── room
 ├── guest
 ├── arrival
 ├── departure
 ├── status
 ├── adults
 ├── children
 ├── rate_code
 └── package_details[]

PackageDetail
 ├── package_code
 ├── package_description
 ├── pkg_qty
 ├── quantity
 ├── persons
 ├── calculation_rule
 ├── products
 └── source_context
```

This is a conceptual model.

Do not automatically create migrations just because this model is useful.

First map it against the existing architecture.

---

# 45. REQUIRED VALIDATION LAYERS

Implement/verify these layers:

### Layer 1 — XML structural validation

Is the XML valid?

### Layer 2 — Oracle structure validation

Does `<PKGFORECAST>` and expected structures exist?

### Layer 3 — Record validation

Are critical reservation fields valid?

### Layer 4 — Package validation

Are package/product groups interpretable?

### Layer 5 — Quantity validation

Are numeric quantities valid?

### Layer 6 — Summary/detail reconciliation

Do calculated package totals match Oracle's summary?

### Layer 7 — Import integrity

Will committing the import duplicate or corrupt data?

### Layer 8 — Operational integrity

Will current check-in/table assignment functionality remain intact?

---

# 46. DAILY CHANGE TEST

The most important test is NOT:

> "Does this exact XML work?"

It is:

> "Will tomorrow's different XML work?"

Create tests where the XML changes:

```text
Forecast Date
Room Numbers
Guest Names
Adult Counts
Child Counts
Package Codes
Package Descriptions
Package Quantities
Reservation Count
```

and verify that the parser dynamically follows the new data.

---

# 47. PRODUCTION REGRESSION REQUIREMENT

Before any production activation, all existing tests must pass.

Also run:

```text
Reference XML test
Dynamic package test
Dynamic date test
Dynamic room test
Dynamic guest test
Adult/child quantity tests
Multiple package test
Duplicate import test
Summary/detail reconciliation test
Check-in regression test
Table assignment regression test
```

---

# 48. REQUIRED AUDIT BEFORE CODE CHANGES

Before changing code, provide:

```text
CURRENT ARCHITECTURE
--------------------
XML Parser:
Import Service:
Database:
Forecast Logic:
Statistics:
Check-In:
Table Assignment:
Duplicate Protection:

CURRENT ASSUMPTIONS
-------------------
List every hardcoded assumption discovered.

For each assumption:
- Where?
- Why?
- Is it valid?
- Is it production-safe?
- What happens when tomorrow's XML changes?

PROPOSED CHANGES
----------------
Only verified changes.
No unnecessary refactoring.
```

---

# 49. REQUIRED FINAL REPORT

After implementation, report:

```text
1. Current parser architecture
2. Problems discovered
3. Hardcoded assumptions removed
4. Dynamic behavior added
5. Package handling
6. Quantity handling
7. Summary/detail reconciliation
8. Daily-change resilience
9. Duplicate protection
10. Database changes
11. API changes
12. Tests added
13. Existing tests result
14. Reference XML result
15. Synthetic/dynamic XML test results
16. Production safety assessment
17. Remaining risks
```

---

# 50. FINAL ACCEPTANCE CRITERIA

The task is COMPLETE only when:

### A.

The parser reads package codes dynamically.

### B.

The parser reads package descriptions dynamically.

### C.

The parser reads room numbers dynamically.

### D.

The parser reads guest information dynamically.

### E.

The parser reads forecast dates dynamically.

### F.

The parser reads adult/child quantities dynamically.

### G.

The parser reads package quantities dynamically.

### H.

The parser supports arbitrary package combinations.

### I.

The parser does not depend on today's number of records.

### J.

The parser does not depend on today's rooms.

### K.

The parser does not depend on today's packages.

### L.

The parser does not depend on today's totals.

### M.

Summary and detail sections are not double-counted.

### N.

Oracle summary totals are reconciled dynamically.

### O.

Unknown/new packages do not cause incorrect classification.

### P.

Duplicate imports do not duplicate operational data.

### Q.

Existing production check-in functionality continues to work.

### R.

Existing table assignment continues to work.

### S.

Existing customers are not affected.

### T.

No destructive production changes are introduced.

### U.

The supplied XML passes completely.

---

# FINAL PRINCIPLE

Build the system to understand the **Oracle XML format**, not today's data.

The correct mental model is:

```text
             ORACLE XML
                  │
                  ▼
        ┌────────────────────┐
        │ Dynamic XML Parser │
        └────────────────────┘
                  │
                  ▼
        ┌────────────────────┐
        │ Context + Semantics│
        └────────────────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │ Current Daily Data   │
       │                      │
       │ Date                 │
       │ Rooms                │
       │ Guests               │
       │ Packages             │
       │ Quantities           │
       │ Reservations         │
       └──────────────────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │ Oracle Reconciliation│
       └──────────────────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │ Breakfast Forecast   │
       └──────────────────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │ Existing Live System │
       │                      │
       │ Host Search          │
       │ Check-In             │
       │ Table Assignment     │
       │ Statistics           │
       └──────────────────────┘
```

### The system must be data-driven, not data-hardcoded.

Today's XML is one example.

Tomorrow's XML may be completely different in its numbers, rooms, guests, packages and quantities.

The parser must continue working without code changes as long as the Oracle XML structure/semantics remain compatible.

**Production stability and data integrity take priority over refactoring or architectural elegance.**