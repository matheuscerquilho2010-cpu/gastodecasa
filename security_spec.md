# Security Specification

## 1. Data Invariants
- A transaction cannot exist without a valid household ID.
- Households must contain a bounded list of member IDs (`memberIds.size() <= 4`).
- Only users whose `uid` is in `memberIds` can view or adding transactions for that household.
- Transactions have strict types ('expense_debit', 'expense_credit', 'income').
- Allowed categories are strictly validated.

## 2. The "Dirty Dozen" Payloads
1. Create Transaction with invalid `amount` (e.g., negative or text).
2. Create Transaction with unauthorized `createdBy` uid.
3. Update Transaction to an unauthorized household.
4. Add > 4 members to a household array.
5. Create Transaction with a missing category.
6. Delete Household by non-owner.
7. Shadow update with ghost fields (e.g., `isAdmin: true` on transaction).
8. Read transactions from a household the user is not a member of.
9. Missing required fields on transaction creation.
10. Spoofing timestamps (providing client-side `createdAt` rather than server timestamp).
11. Update transaction bypassing `isValidTransaction`.
12. Creating household without self in `memberIds`.

## 3. The Test Runner
Tests will verify that these payloads return PERMISSION_DENIED.
