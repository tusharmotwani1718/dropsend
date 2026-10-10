# Overview

Currently, the receipts uploading feature work fine but there is no way to detect duplication of receipts.

Like, a user can upload same receipts multiple times, intentionally or by mistake, and there should be a feature or flag to mark the same upload as "probable duplicate" of already existing receipt.



## How to decide duplication

We can detect the duplicates by matching the fields or info extracted from the receipt to those which are already uploaded by the user.

Remember, duplication should be checked against the successfully uploaded receipts only, not with the failed ones.

There are majorly these fields which could be used to detect the duplication of receipts:

1. bill/receipt date
2. items
3. amount
4. merchant

Once all of these match in value with one of the previously uploaded receipt, means the new receipt is a "Probable Duplicate".

The user should be informed about this with a flag and given an option to "Discard" or "Upload Anyway".


## Layers

01. Modify the supabase schemas for the duplicate flag
02. Add duplicate-detection layer and backend logic
03. Wire UI to the backend in upload receipt
04. Write the updated spec file