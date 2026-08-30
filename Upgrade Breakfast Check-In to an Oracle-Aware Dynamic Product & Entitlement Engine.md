## REFERENCE FILES — BOTH ARE REQUIRED

Two reference files are attached and must be analyzed together before making any implementation decision:

### 1. `pkgforecast_24021164.XML`

This is a real Oracle Package Forecast export.

Use it to understand:

* XML hierarchy
* forecast/stay dates
* product groups
* reservation details
* rooms
* guests
* adults/children
* package/product relationships
* PKG_QTY
* QUANTITY
* PERSONS
* NO_OF_ROOMS
* CALCULATION_RULE
* reservation statuses
* report totals
* summary vs detail structures

This file represents **daily operational data**.

Its values are NOT permanent.

### 2. `Package Codes.PDF`

This is the Oracle Package Codes/Product Master reference.

Use it to understand:

* Product Code
* Product Description
* Product Type
* POS Inventory
* Forecast Group
* Calculation Rule
* other Oracle product configuration

This file represents **Oracle product definitions/configuration**.

Its purpose is NOT to provide hardcoded production values. It is the reference used to understand how Oracle defines products.

---

## IMPORTANT

Do not analyze either file in isolation.

The correct interpretation requires correlating:

```text
Daily XML
    +
Oracle Package Codes / Product Master
    ↓
Correct Product Interpretation
    ↓
Breakfast Entitlement
```

Do NOT copy product codes from the reference files into production code.

Do NOT hardcode the numbers, rooms, guests, package list, or totals found in the reference XML.

Use the files to understand the **Oracle data model and semantics** so the implementation remains dynamic for future daily exports.
# Upgrade Breakfast Check-In to an Oracle-Aware Dynamic Product & Entitlement Engine

## ROLE

You are modifying an existing **LIVE production Breakfast Check-In system** used by real hotel staff and guests.

The system currently imports an Oracle Package Forecast XML and allows the host to:

- search by room
- identify the guest/reservation
- determine breakfast entitlement
- check the guest in
- assign a table
- view operational breakfast statistics

The current system is already working in production.

Your task is to **extend and harden the existing system**, not rebuild it.

---

# 1. NEW SOURCE OF TRUTH

We now have two different Oracle-generated sources:

### Source A — Daily Package Forecast XML

This answers:

> WHAT PRODUCTS / PACKAGES / RESERVATIONS EXIST TODAY?

It contains the actual daily operational data:

- stay dates
- reservations
- rooms
- guests
- adults
- children
- package/product codes
- package quantities
- persons
- calculation rules
- reservation statuses
- product combinations
- Oracle report information

### Source B — Oracle Package Codes Report

File:

`Package Codes.PDF`

This answers:

> WHAT DOES EACH PRODUCT CODE MEAN?

It is a Product Master / Oracle configuration reference.

It contains information such as:

- Product Code
- Product Type
- Description
- POS Inventory
- Forecast Group
- Calculation Rule
- Transaction configuration
- Rate Code
- Season
- Price
- Posting Rhythm

The supplied PDF contains 15 pages of Product Code definitions.

---

# 2. FUNDAMENTAL ARCHITECTURAL CHANGE

The system must no longer think:

```text
XML Product Code
       ↓
Hardcoded Breakfast Rule
       ↓
Breakfast
```

Instead:

```text
Daily Oracle XML
       +
Oracle Product Master
       ↓
Product Resolution
       ↓
Product Classification
       ↓
Breakfast Entitlement Rules
       ↓
Breakfast Covers
```

The XML tells us what happened today.

The Product Master tells us what the product means.

The business rules determine how it contributes to breakfast entitlement.

---

# 3. NEVER HARDcode PRODUCT CODES

Do NOT create logic such as:

```php
if ($productCode === 'BFAIN') ...
if ($productCode === 'BFCIN') ...
if ($productCode === 'UPSBB1') ...
```

as the primary architecture.

This is explicitly forbidden.

Product codes can change.

New products can be created.

Existing products can be renamed/reconfigured.

Products can become inactive.

New Breakfast products may be introduced.

Existing Breakfast products may disappear.

The system must be driven by Product Master data.

---

# 4. CREATE / VERIFY A PRODUCT MASTER CONCEPT

Inspect the existing database architecture first.

If there is already a suitable product/package table, extend it rather than creating unnecessary duplication.

If no suitable structure exists, introduce a minimal Product Master abstraction.

Conceptually:

```text
product_master
-------------------------
id
product_code
product_type
description
category
meal_type
guest_type
calculation_basis
forecast_group
calculation_rule
pos_inventory
active
source
last_synced_at
raw_metadata
created_at
updated_at
```

Do NOT blindly create these exact columns.

First inspect the existing architecture.

Use the smallest schema required.

---

# 5. PRODUCT MASTER MUST REPRESENT ORACLE, NOT REPLACE IT

The Product Master should preserve Oracle terminology.

For example, the supplied PDF defines:

```text
BFAIN
Breakfast Adult Included in Rate
```

and:

```text
BFCIN
Breakfast Child Included in Rate
```

and:

```text
BFAAD
Breakfast Adult Add On Package
```

These definitions come directly from the Oracle Package Codes report. 
Preserve:

```text
product_code
product_type
description
forecast_group
calculation_rule
```

rather than replacing Oracle's meaning with arbitrary application terminology.

---

# 6. PRODUCT CLASSIFICATION MUST BE DATA-DRIVEN

The system must support classifications such as:

```text
BREAKFAST
FULL_BOARD
HALF_BOARD
UPSELL
OTHER_FOOD_BEVERAGE
TECHNICAL
OTHER
UNKNOWN
```

However:

**Do not classify based only on the Product Code prefix.**

For example:

```text
UPSBB1
UPSBB2
UPSBB3
UPSBB4
```

are Breakfast products despite the `UPS` prefix.

The Oracle Product Codes report explicitly describes:

```text
UPSBB1 = Breakfast 1 person
UPSBB2 = Breakfast 2 person
UPSBB3 = Breakfast 3 people
UPSBB4 = Breakfast 4 people
```

and marks them under Breakfast. 
Therefore prefix-based classification is prohibited.

---

# 7. USE ORACLE METADATA TO DETERMINE MEANING

When resolving a product, consider the available Oracle metadata:

```text
PRODUCT_CODE
PRODUCT_TYPE
DESCRIPTION
POS_INV
FORECAST_GROUP
CALCULATION_RULE
```

and, when relevant:

```text
RATE_CODE
POSTING_RHYTHM
SEASON
```

For example:

### Breakfast

The Product Master contains:

```text
BFAIN
Breakfast Adult Included in Rate
```

and:

```text
BFCIN
Breakfast Child Included in Rate
```

with Breakfast as the POS/operational classification.

### Full Board

The Product Master contains:

```text
FBAAD
FB Adult Add On Package

FBAIN
FB Adult Included in Rate
```

with:

```text
Other food and beverage
```

and Forecast Group 2030.

### Half Board

The Product Master contains:

```text
HBAAD
HBAIN
```

with the corresponding Half Board descriptions and Forecast Group 2010.

### Other products

Examples include:

```text
USS100
USS500
USS1500
...
```

which are explicitly described as Upsell packages. 
---

# 8. PRODUCT MASTER MUST BE SYNCHRONIZABLE

The Product Codes report may change in the future.

Therefore the system should support updating/synchronizing Product Master data.

The architecture should allow:

```text
New Oracle Package Codes Report
          ↓
Product Master Sync
          ↓
New / Updated / Removed products
```

without changing application code.

If automatic PDF parsing is not reliable enough, do NOT build a fragile PDF parser just for the sake of automation.

Instead provide a safe import/admin mechanism.

The important requirement is:

> Product meaning must be configurable data, not code.

---

# 9. DAILY XML IMPORT MUST RESOLVE PRODUCTS AGAINST PRODUCT MASTER

When importing the daily XML:

```text
XML PRODUCT_ID
        ↓
Product Master lookup
        ↓
Resolved Product
```

If found:

```text
resolved = true
```

If not found:

```text
resolved = false
classification = UNKNOWN
```

Do NOT silently guess.

---

# 10. UNKNOWN PRODUCT SAFETY

If tomorrow Oracle introduces:

```text
NEWBF01
```

and the system has never seen it before:

DO NOT assume:

```text
Breakfast
```

DO NOT assume:

```text Adult
```

DO NOT assume:

```text Child
```

Instead:

```text
UNKNOWN PRODUCT
```

and surface a clear warning.

The system must allow an authorized administrator to classify/map it safely.

This is critical for production data integrity.

---

# 11. MULTIPLE PRODUCTS PER RESERVATION

A reservation can contain:

```text
PRODUCTS = BFAIN,BFCIN
```

or:

```text
PRODUCTS = UPS300C,BFAIN,BFCIN
```

or:

```text
PRODUCTS = USS500,BFAIN,BFCIN
```

The system must treat these as multiple product relationships.

Do NOT replace the list with one "main package".

Preserve:

```text
raw_products
products[]
```

---

# 12. IMPORTANT: PRODUCT ≠ BREAKFAST ENTITLEMENT

A reservation may have:

```text
UPS300C
+
BFAIN
+
BFCIN
```

The existence of `UPS300C` does not eliminate the breakfast entitlement.

Likewise, the presence of an upsell product does not automatically mean it contributes breakfast covers.

Each product must be resolved independently.

---

# 13. INTRODUCE AN ENTITLEMENT LAYER

Do not let the parser itself decide breakfast covers.

Separate:

### XML Parsing

```text
What does Oracle report?
```

from:

### Product Resolution

```text
What does this product mean?
```

from:

### Entitlement Calculation

```text
How many breakfast covers does it provide?
```

Recommended conceptual flow:

```text
Oracle XML
   ↓
Raw Reservation/Product Data
   ↓
Product Resolution
   ↓
Breakfast Classification
   ↓
Entitlement Calculation
   ↓
Breakfast Covers
```

---

# 14. PRESERVE RAW ORACLE QUANTITY FIELDS

For every reservation/product relationship preserve:

```text
PKG_QTY
QUANTITY
PERSONS
ADULTS
CHILDREN
NO_OF_ROOMS
CALCULATION_RULE
```

Do not collapse them into one field prematurely.

---

# 15. NEVER ASSUME PERSONS = PACKAGE QUANTITY

The new XML contains cases such as:

```text
ADULTS = 2
CHILDREN = 1
PERSONS = 3

PKG_QTY = 2
QUANTITY = 2
```

Therefore:

```text
PERSONS
```

cannot automatically be used as:

```text
PKG_QTY
```

and:

```text
PKG_QTY
```

cannot automatically be replaced by:

```text
PERSONS
```

Preserve the Oracle values and use the appropriate calculation semantics.

---

# 16. CALCULATION RULE MUST BE PRESERVED

The Product Codes report and XML contain calculation-rule information.

The system must not assume:

```text
CALCULATION_RULE = A
```

for everything.

The new XML already demonstrates multiple calculation rules.

The calculation rule must be treated as data.

Do not hardcode a universal quantity formula.

---

# 17. BREAKFAST ENTITLEMENT SHOULD BE EXPLAINABLE

For every breakfast entitlement, the system should be able to explain:

```text
Guest
Room
Product Code
Product Description
Classification
Adults
Children
Persons
PKG_QTY
QUANTITY
Calculation Rule
Final Breakfast Entitlement
```

Example conceptual output:

```text
Room: 0503

Product:
BFAIN

Description:
Breakfast Adult Included in Rate

Adults:
2

PKG_QTY:
2

Breakfast Entitlement:
2
```

This is important for host trust and debugging.

---

# 18. ADD AN "ENTITLEMENT SOURCE" CONCEPT

Every breakfast cover should have a traceable source.

For example:

```text
INCLUDED_IN_RATE
ADD_ON_PACKAGE
BREAKFAST_FLAT_PACKAGE
BREAKFAST_PRODUCT
UNKNOWN
```

Do not hardcode these values based only on code prefixes.

Derive them from Product Master metadata and configured business rules.

---

# 19. SUPPORT MULTIPLE BREAKFAST PRODUCT TYPES

The Product Master demonstrates that Breakfast is not represented by one coding pattern.

Examples include:

```text
BFAAD
BFAIN
BFCAD
BFCIN
UPSBB1
UPSBB2
UPSBB3
UPSBB4
WEB_BFSA
WEB_BFSC
```

The application must support all valid Breakfast products found in Product Master.

Do not hardcode this list.

---

# 20. ADULT / CHILD SEMANTICS

Where Oracle explicitly defines:

```text
Breakfast Adult
Breakfast Child
Per Adult
Per Child
```

preserve that semantic information.

For example:

```text
BFAIN
```

is explicitly:

```text
Breakfast Adult Included in Rate
```

while:

```text
BFCIN
```

is:

```text
Breakfast Child Included in Rate
```

The Product Master provides these definitions.

---

# 21. FLAT-RATE BREAKFAST PRODUCTS

The Product Codes report also contains:

```text
UPSBB1
UPSBB2
UPSBB3
UPSBB4
```

described as:

```text
Breakfast 1 person
Breakfast 2 person
Breakfast 3 people
Breakfast 4 people
```

These use:

```text
Flat Rate
```

and therefore must not necessarily be calculated using the same rule as:

```text
Per Adult
Per Child
```

products. 
This distinction must exist in the entitlement engine.

---

# 22. SUMMARY VS DETAIL

Continue to distinguish:

```text
Oracle Summary
```

from:

```text
Reservation Detail
```

The summary is used for reconciliation.

The detail is used for:

- room search
- guest identification
- entitlement
- operational check-in

Never count both as reservations.

---

# 23. DYNAMIC RECONCILIATION

For every daily XML:

```text
Oracle Summary
      VS
Calculated Detail
```

must be compared dynamically.

Do not hardcode expected package codes.

Build the comparison from the union of package codes found in:

```text
summary
+
details
+
product master
```

Flag:

```text
missing
extra
mismatch
unknown
```

---

# 24. IMPORTANT: RECONCILIATION IS NOT THE SAME AS BREAKFAST ENTITLEMENT

Do not force:

```text
Oracle Total Package Quantity
=
Breakfast Covers
```

for every product.

Some Oracle products are:

```text
Upsell
Full Board
Half Board
Laundry
Tourism Dirham
Technical
Other
```

The reconciliation layer should first reconcile Oracle product quantities.

Then the entitlement layer determines which products contribute to Breakfast.

---

# 25. MULTI-DATE SUPPORT

The system must support an XML containing:

```text
one STAY_DATE
```

or:

```text
multiple STAY_DATE values
```

The parser must not assume:

```text
one XML = one date
```

Structure the normalized data as:

```text
Forecast
 ├── Date 1
 │    ├── Products
 │    └── Reservations
 │
 ├── Date 2
 │    ├── Products
 │    └── Reservations
 │
 └── Date N
```

If the supplied XML contains only one date, it remains a valid single-date case.

---

# 26. REPORT SCOPE

The XML may be exported:

- with filters
- without filters
- for one date
- for multiple dates
- with specific product filters
- with broad product scope

The system must NOT assume that:

```text
all products in the XML = breakfast
```

and must NOT claim:

```text
all hotel breakfast forecast
```

unless the imported data actually supports that conclusion.

Store/report:

```text
forecast date(s)
number of products
number of reservations
resolved products
unknown products
breakfast products
non-breakfast products
```

where practical.

---

# 27. PRODUCT MASTER + XML MUST WORK TOGETHER

Example:

```text
XML says:

PRODUCTS = UPS300C,BFAIN,BFCIN
```

Product Master says:

```text
UPS300C
→ AED 300 Club Upsell package
→ Breakfast-related metadata must be evaluated

BFAIN
→ Breakfast Adult Included in Rate

BFCIN
→ Breakfast Child Included in Rate
```

The system then determines:

```text
Breakfast entitlement
```

from the actual reservation quantities and configured product semantics.

---

# 28. DO NOT MAKE AI THE FINAL AUTHORITY

If AI-assisted classification is ever introduced:

AI may suggest:

```text
classification = BREAKFAST
confidence = 0.97
```

but the final operational classification must come from:

```text
Oracle Product Master
+
configured business rules
```

AI must never silently invent a breakfast entitlement for a live guest.

---

# 29. PRODUCT MASTER ADMINISTRATION

If a new Product Code appears, provide an appropriate operational path such as:

```text
Unknown Products
```

showing:

```text
Code
Oracle Description
Detected Metadata
First Seen
Number of Reservations
```

An authorized user can then map/classify it.

Once classified, the system uses that mapping for future imports.

---

# 30. DO NOT BREAK CURRENT HOST WORKFLOW

The current host workflow must remain unchanged:

```text
Search Room
     ↓
Find Guest
     ↓
See Entitlement
     ↓
Check In
     ↓
Assign Table
```

The new Product Master/Entitlement layer should operate underneath the existing UI.

Only add UI information where it is genuinely useful.

---

# 31. CHECK-IN MUST REMAIN SEPARATE FROM FORECAST

Never modify forecast quantities when a guest is checked in.

Maintain separately:

```text
Forecast Entitlement
Actual Check-In
Table Assignment
```

Example:

```text
Forecast:
209

Checked In:
3

Remaining:
206
```

Do not overwrite forecast data.

---

# 32. IMPORT MUST REMAIN IDEMPOTENT

Importing the same XML twice must not:

- duplicate reservations
- duplicate products
- duplicate breakfast entitlement
- duplicate statistics
- duplicate check-ins

Use the existing identity strategy where possible.

---

# 33. SAFE UNKNOWN PRODUCT BEHAVIOR

If:

```text
XML Product = NEW123
```

and Product Master does not contain it:

The system should:

1. Import the raw product safely if possible.
2. Mark it as `UNKNOWN`.
3. Exclude it from automatic Breakfast entitlement unless safely classified.
4. Display an actionable warning.
5. Preserve the data for later classification.
6. Never silently guess.

---

# 34. PRODUCT MASTER SHOULD NOT DELETE HISTORY

If a product disappears from today's Oracle Package Codes report:

do not delete historical product definitions or historical reservations.

Use:

```text
active/inactive
```

or equivalent versioning.

Historical data must remain understandable.

---

# 35. TEST THE ACTUAL PRODUCT MASTER

Create tests based on the supplied PDF.

At minimum verify that the system correctly recognizes:

```text
BFAAD → Breakfast Adult Add On Package
BFAIN → Breakfast Adult Included in Rate
BFCAD → Breakfast Child Add On Package
BFCIN → Breakfast Child Included in Rate

UPSBB1 → Breakfast 1 person
UPSBB2 → Breakfast 2 person
UPSBB3 → Breakfast 3 people
UPSBB4 → Breakfast 4 people

FBAAD/FBAIN → Full Board
HBAAD/HBAIN → Half Board

USS... → Upsell products
```

These classifications must come from Product Master data, not hardcoded parser logic.

The source PDF explicitly identifies these product types. 
---

# 36. TEST THE MOST IMPORTANT EDGE CASE

Create a reservation containing:

```text
UPS300C
+
BFAIN
+
BFCIN
```

Verify that:

- UPS300C is not incorrectly treated as the Breakfast entitlement merely because it appears first.
- BFAIN is recognized as adult breakfast.
- BFCIN is recognized as child breakfast.
- all products remain attached to the reservation.
- the final breakfast entitlement is calculated from the relevant products and quantities.

---

# 37. TEST UPSBB PRODUCTS

Explicitly test:

```text
UPSBB1
UPSBB2
UPSBB3
UPSBB4
```

because their prefix could easily cause a bad parser to classify them as generic Upsell products.

The Oracle Product Codes report explicitly identifies these as Breakfast products. 
---

# 38. TEST FULL BOARD / HALF BOARD

Verify that:

```text
FBAIN
HBAIN
```

do not accidentally become Breakfast merely because they contain food/beverage entitlements.

Their Oracle definitions distinguish Full Board and Half Board from Breakfast. 
---

# 39. TEST UNKNOWN PRODUCT

Create:

```text
NEW_PRODUCT_999
```

Expected:

```text
Resolved: NO
Classification: UNKNOWN
Breakfast Entitlement: NOT AUTOMATICALLY ASSIGNED
Warning: YES
```

---

# 40. TEST PRODUCT MASTER CHANGE

Change a product's classification/configuration in the Product Master.

Verify that:

- no code change is required
- future imports use the new configuration
- historical records remain unchanged

---

# 41. TEST DAILY VARIATION

Generate tests where tomorrow's XML has:

- completely different rooms
- different guests
- different quantities
- different product codes
- additional products
- fewer products
- multiple dates
- different reservation counts

The parser must continue working.

---

# 42. TEST UNFILTERED EXPORT

Use the unfiltered XML sample.

The system must:

1. Discover all product codes.
2. Resolve them against Product Master.
3. Separate Breakfast from non-Breakfast products.
4. Preserve all reservation/product relationships.
5. Calculate Breakfast entitlement only from relevant products.
6. Reconcile Oracle summary/detail quantities.
7. Report unknown products.
8. NOT assume the entire report is Breakfast-only.

---

# 43. PRODUCT MASTER SHOULD BE THE INTERPRETATION BRIDGE

The final architecture should conceptually be:

```text
                 ORACLE
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
     Daily XML        Package Codes
          │                 │
          │                 │
          ▼                 ▼
     Actual Data       Product Master
          │                 │
          └────────┬────────┘
                   ▼
           Product Resolution
                   │
                   ▼
         Product Classification
                   │
                   ▼
         Entitlement Calculation
                   │
                   ▼
          Breakfast Forecast
                   │
                   ▼
           Existing Host UI
                   │
          ┌────────┴────────┐
          ▼                 ▼
       Check-In       Table Assignment
```

---

# 44. PRODUCTION SAFETY

Before modifying production code:

- inspect current parser
- inspect current database
- inspect current import flow
- inspect current statistics
- inspect check-in
- inspect table assignment
- inspect existing tests

Do not redesign working code unnecessarily.

Prefer additive changes.

Do not perform destructive migrations.

Do not modify live data.

Do not re-import the reference XML into production.

Do not reset/truncate production tables.

---

# 45. REQUIRED IMPLEMENTATION STRATEGY

Work in this sequence:

### PHASE 1 — AUDIT

Do not change behavior.

Document:

- current parser
- current package assumptions
- current hardcoded codes
- current statistics logic
- current database mapping
- current check-in dependency

### PHASE 2 — PRODUCT MASTER

Implement the Product Master abstraction.

### PHASE 3 — PRODUCT RESOLUTION

Resolve XML products against Product Master.

### PHASE 4 — ENTITLEMENT ENGINE

Separate product meaning from breakfast entitlement calculation.

### PHASE 5 — RECONCILIATION

Compare Oracle summary against detail dynamically.

### PHASE 6 — TESTING

Run the complete regression suite.

### PHASE 7 — SHADOW MODE

Where practical:

```text
Current Logic
VS
New Product-Master Logic
```

without changing production behavior.

### PHASE 8 — ACTIVATION

Only activate after successful validation.

---

# 46. BEFORE CODING — STOP AND REPORT

Before changing any code, provide:

```text
CURRENT ARCHITECTURE
--------------------
Parser:
Import Service:
Product/Package Storage:
Forecast Logic:
Statistics:
Check-In:
Table Assignment:

CURRENT HARDCODED ASSUMPTIONS
-----------------------------
List every hardcoded product/package assumption.

PRODUCT MASTER GAP
------------------
What information is currently missing?

ENTITLEMENT GAP
---------------
How is Breakfast currently calculated?

RECONCILIATION GAP
------------------
How are Oracle totals currently validated?

PROPOSED MINIMAL CHANGES
------------------------
List exact files/classes/components to change.

PRODUCTION RISK
---------------
Explain why the proposed changes are safe.
```

Do NOT start implementation before producing this audit.

---

# 47. AFTER IMPLEMENTATION — REQUIRED REPORT

Provide:

```text
1. Architecture changes
2. Product Master implementation
3. Product resolution logic
4. Breakfast classification logic
5. Entitlement calculation
6. Summary/detail reconciliation
7. Unknown product handling
8. Multi-date handling
9. Unfiltered report handling
10. Database changes
11. API changes
12. UI changes
13. Tests added
14. Existing tests result
15. Reference XML result
16. Product Master validation result
17. Regression result
18. Production safety assessment
19. Remaining risks
```

---

# FINAL ACCEPTANCE CRITERIA

The task is complete only when:

- Product codes are NOT hardcoded into parser logic.
- Product meaning comes from Product Master.
- Oracle Product Code metadata is preserved.
- Breakfast classification is data-driven.
- UPSBB1–UPSBB4 are correctly recognized as Breakfast.
- UPS300C is not automatically classified as Breakfast.
- Full Board and Half Board are not confused with Breakfast.
- Multiple products per reservation are supported.
- Raw Oracle quantity fields are preserved.
- `PERSONS`, `PKG_QTY`, and `QUANTITY` are not blindly treated as equivalent.
- `CALCULATION_RULE` is preserved.
- Unknown products are safely flagged.
- New products can be introduced without code changes.
- Unfiltered XML is supported.
- Filtered XML is supported.
- One-date XML is supported.
- Multi-date XML is supported.
- Oracle summary/detail reconciliation is dynamic.
- Duplicate imports remain safe.
- Existing check-in functionality remains intact.
- Existing table assignment remains intact.
- Historical data is protected.
- No destructive production changes are introduced.
- Existing tests pass.
- New tests pass.
- Reference XML passes.
- Product Master classifications pass.

---

# FINAL DESIGN PRINCIPLE

Do not build a system that knows:

```text
BFAIN
BFCIN
UPSBB1
...
```

Build a system that knows how to understand:

```text
Oracle Product Master
```

Then today's codes, tomorrow's codes, and future codes become data.

The final goal is:

```text
ORACLE CONFIGURATION
        ↓
PRODUCT MASTER
        ↓
DAILY ORACLE XML
        ↓
PRODUCT RESOLUTION
        ↓
ENTITLEMENT ENGINE
        ↓
BREAKFAST COVERS
        ↓
LIVE BREAKFAST OPERATION
```

**The system must understand Oracle's data, not memorize today's Oracle data.**

**Production stability, traceability, and correctness are more important than refactoring elegance.**