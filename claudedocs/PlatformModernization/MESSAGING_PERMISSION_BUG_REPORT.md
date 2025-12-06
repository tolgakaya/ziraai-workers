# 🐛 Critical Bug Report: Farmer-to-Sponsor Messaging Permission Error

**Date**: 2025-12-04
**Severity**: 🔴 **HIGH** - Blocks core messaging functionality
**Reporter**: Mobile Team (Flutter)
**Status**: 🚨 **BLOCKING PRODUCTION USE**

---

## Executive Summary

**Farmers cannot reply to sponsors in their own sponsored analyses.** The backend incorrectly rejects legitimate farmer-to-sponsor messages with a 400 Bad Request error, breaking the core messaging feature between farmers and sponsors.

---

## Problem Description

### What Should Happen:
1. Sponsor sends message to Farmer about their analysis ✅
2. Farmer receives message ✅
3. Farmer replies to Sponsor ❌ **FAILS HERE**

### What Actually Happens:
```json
{
  "success": false,
  "message": "You can only message farmers for analyses done using sponsorship codes you purchased or distributed"
}
```

**This error message is incorrect for the Farmer → Sponsor direction!**

---

## Reproduction Steps

1. **Sponsor (UserId: 159)** sponsors an analysis
2. **Farmer (UserId: 190)** performs analysis (AnalysisId: 196)
3. Sponsor sends message to Farmer: "selam" ✅ **SUCCESS**
4. Farmer tries to reply to Sponsor: "Aleykm selam" ❌ **400 BAD REQUEST**

---

## Technical Evidence

### Frontend Log (application.log)

**Line 99**: Farmer's message request
```json
{
  "plantAnalysisId": 196,
  "toUserId": 159,
  "message": "Aleykm selam"
}
```

**Line 123**: Backend error response
```json
{
  "success": false,
  "message": "You can only message farmers for analyses done using sponsorship codes you purchased or distributed"
}
```

### Backend Log (application.txt)

**Line 28**: Proof that Sponsor owns this analysis
```json
{
  "fromUserId": 159,
  "toUserId": 190,
  "senderRole": "Sponsor",
  "message": "selam"
}
```
→ Sponsor (159) successfully sent message, proving they sponsor this analysis

**Line 162-163**: Backend rejecting Farmer's reply
```
[SendMessage] User 190 sending message. Command: {
  "FromUserId": 190,
  "ToUserId": 159,
  "PlantAnalysisId": 196,
  "Message": "Aleykm selam"
}
Result: Success=False, Message=You can only message farmers for analyses done using sponsorship codes you purchased or distributed
```

---

## Root Cause Analysis

### Current (Broken) Backend Logic:

```csharp
// SponsorshipController.cs → SendMessage endpoint
// ❌ PROBLEM: Only validates Sponsor → Farmer direction
// ❌ PROBLEM: Doesn't handle Farmer → Sponsor replies

public async Task<IActionResult> SendMessage(SendMessageCommand command)
{
    // This validation is INCOMPLETE
    if (!await HasPermissionToMessage(command))
    {
        return BadRequest("You can only message farmers for analyses done using sponsorship codes you purchased or distributed");
    }
}

// ❌ HasPermissionToMessage() only checks if SPONSOR owns the code
// ❌ Doesn't check if FARMER owns the analysis and is replying to their sponsor
```

### Expected (Correct) Backend Logic:

```csharp
public async Task<IActionResult> SendMessage(SendMessageCommand command)
{
    var currentUser = GetCurrentUser();
    var analysis = await GetAnalysis(command.PlantAnalysisId);

    // ✅ CASE 1: Sponsor → Farmer
    if (currentUser.Roles.Contains("Sponsor"))
    {
        // Sponsor can only message farmers for analyses they sponsored
        if (!await HasSponsorPermission(currentUser.Id, command.PlantAnalysisId))
        {
            return BadRequest("You can only message farmers for analyses done using sponsorship codes you purchased or distributed");
        }
    }

    // ✅ CASE 2: Farmer → Sponsor (MISSING IN CURRENT CODE!)
    else if (currentUser.Roles.Contains("Farmer"))
    {
        // Farmer can ALWAYS reply to sponsor in their own analysis
        if (analysis.UserId != currentUser.Id)
        {
            return BadRequest("You can only message sponsors for your own analyses");
        }

        // Farmer must be replying to the sponsor who sponsored this analysis
        if (analysis.SponsorUserId == null || analysis.SponsorUserId != command.ToUserId)
        {
            return BadRequest("You can only message the sponsor of this analysis");
        }

        // ✅ ALLOW - Farmer replying to their sponsor
    }

    // Proceed with sending message...
}
```

---

## Affected Files (Backend)

### Primary Files to Fix:

1. **`WebAPI/Controllers/SponsorshipController.cs`**
   - Method: `SendMessage(SendMessageCommand command)`
   - Line: ~162 (based on log timestamps)
   - **Action**: Add Farmer → Sponsor permission check

2. **`Business/Handlers/Sponsorship/Commands/SendMessage/SendMessageCommandHandler.cs`**
   - Method: `Handle(SendMessageCommand request, CancellationToken cancellationToken)`
   - **Action**: Update permission validation logic

3. **`Business/Handlers/Sponsorship/Commands/SendMessage/SendMessageCommandValidator.cs`** (if exists)
   - **Action**: Add role-based validation rules

---

## Proposed Solution

### Step 1: Update Permission Check Logic

```csharp
// Business/Handlers/Sponsorship/Commands/SendMessage/SendMessageCommandHandler.cs

private async Task<bool> ValidateMessagingPermission(
    SendMessageCommand command,
    User currentUser,
    PlantAnalysis analysis)
{
    // CASE 1: Sponsor → Farmer
    if (currentUser.Roles.Contains("Sponsor"))
    {
        // Check if sponsor owns the code used for this analysis
        var sponsorshipCode = await _sponsorshipRepository
            .GetCodeUsedForAnalysis(command.PlantAnalysisId);

        if (sponsorshipCode == null || sponsorshipCode.SponsorUserId != currentUser.Id)
        {
            _logger.LogWarning(
                "[SendMessage] Sponsor {SponsorId} attempted to message farmer for analysis {AnalysisId} they don't sponsor",
                currentUser.Id, command.PlantAnalysisId);
            return false;
        }

        return true;
    }

    // CASE 2: Farmer → Sponsor (NEW CODE!)
    else if (currentUser.Roles.Contains("Farmer"))
    {
        // Verify farmer owns this analysis
        if (analysis.UserId != currentUser.Id)
        {
            _logger.LogWarning(
                "[SendMessage] Farmer {FarmerId} attempted to message about analysis {AnalysisId} they don't own",
                currentUser.Id, command.PlantAnalysisId);
            return false;
        }

        // Verify they're messaging the sponsor who sponsored this analysis
        if (analysis.SponsorUserId == null)
        {
            _logger.LogWarning(
                "[SendMessage] Farmer {FarmerId} attempted to message about non-sponsored analysis {AnalysisId}",
                currentUser.Id, command.PlantAnalysisId);
            return false;
        }

        if (analysis.SponsorUserId != command.ToUserId)
        {
            _logger.LogWarning(
                "[SendMessage] Farmer {FarmerId} attempted to message user {ToUserId} who didn't sponsor analysis {AnalysisId}",
                currentUser.Id, command.ToUserId, command.PlantAnalysisId);
            return false;
        }

        _logger.LogInformation(
            "[SendMessage] Farmer {FarmerId} replying to sponsor {SponsorId} for their analysis {AnalysisId}",
            currentUser.Id, command.ToUserId, command.PlantAnalysisId);
        return true;
    }

    return false;
}
```

### Step 2: Update Controller Response

```csharp
// WebAPI/Controllers/SponsorshipController.cs

[HttpPost("messages")]
public async Task<IActionResult> SendMessage(SendMessageCommand command)
{
    _logger.LogInformation(
        "[SendMessage] User {UserId} sending message. Command: {@Command}",
        UserId, command);

    var result = await Mediator.Send(command);

    if (!result.Success)
    {
        // Return appropriate error message based on user role
        var currentUser = GetCurrentUser();
        string errorMessage = currentUser.Roles.Contains("Sponsor")
            ? "You can only message farmers for analyses done using sponsorship codes you purchased or distributed"
            : "You can only reply to sponsors for your own sponsored analyses";

        _logger.LogWarning(
            "[SendMessage] Result: Success={Success}, Message={Message}",
            result.Success, result.Message);

        return BadRequest(new { success = false, message = errorMessage });
    }

    return Ok(result);
}
```

---

## Testing Requirements

### Test Case 1: Sponsor → Farmer (Should Work)
✅ **Input**: Sponsor (159) → Farmer (190) for analysis sponsored by Sponsor (159)
✅ **Expected**: 200 OK, message sent

### Test Case 2: Farmer → Sponsor (Currently Broken, Should Work)
✅ **Input**: Farmer (190) → Sponsor (159) for analysis (196) sponsored by Sponsor (159)
✅ **Expected**: 200 OK, message sent
❌ **Current**: 400 Bad Request

### Test Case 3: Farmer → Wrong Sponsor (Should Fail)
❌ **Input**: Farmer (190) → Different Sponsor (999) for analysis (196)
❌ **Expected**: 400 Bad Request with appropriate message

### Test Case 4: Sponsor → Unrelated Farmer (Should Fail)
❌ **Input**: Sponsor (159) → Farmer (200) for analysis they didn't sponsor
❌ **Expected**: 400 Bad Request

---

## Impact Assessment

### User Impact:
- **Severity**: 🔴 **CRITICAL**
- **Affected Users**: ALL farmers trying to communicate with sponsors
- **User Experience**: Completely broken - farmers think feature doesn't work
- **Business Impact**: Core feature unusable, affects sponsor-farmer relationship

### Timeline:
- **Discovered**: 2025-12-04
- **Blocking**: Messaging feature unusable
- **Priority**: 🚨 **P0 - Fix immediately**

---

## Additional Notes

### Frontend Workaround:
There is **NO frontend workaround possible** - this is purely a backend authorization issue.

### Database Schema:
The `PlantAnalysis` table should have `SponsorUserId` or related sponsorship information to validate farmer replies. Please confirm this field exists and is populated correctly.

### Related Features:
- This bug affects the entire sponsor-farmer communication system
- May also affect notification system if farmers can't reply
- Could break the "Uzmana Sor" (Ask Expert) feature completely

---

## Contact

**Reported by**: Mobile Development Team
**Test Environment**: Staging (ziraai-api-sit.up.railway.app)
**Test User IDs**:
- Farmer: 190
- Sponsor: 159
- Analysis: 196

**For Questions**: Please contact mobile team for additional logs or reproduction assistance.

---

## Appendix: Full Error Logs

### Frontend Log (application.log:106-125)
```
🌐 DIO: *** DioException ***:
uri: https://ziraai-api-sit.up.railway.app/api/v1/sponsorship/messages
DioException [bad response]: This exception was thrown because the response has a status code of 400
statusCode: 400
Response Text:
{"success":false,"message":"You can only message farmers for analyses done using sponsorship codes you purchased or distributed"}
```

### Backend Log (application.txt:162-163)
```
2025-12-04 12:14:29.006 +00:00 [INF] [WebAPI.Controllers.SponsorshipController]
[SendMessage] User 190 sending message.
Command: {"FromUserId":190,"ToUserId":159,"PlantAnalysisId":196,"Message":"Aleykm selam"}

2025-12-04 12:14:29.035 +00:00 [INF] [WebAPI.Controllers.SponsorshipController]
[SendMessage] Result: Success=False,
Message=You can only message farmers for analyses done using sponsorship codes you purchased or distributed
```

---

**Thank you for your attention to this critical issue!** 🙏

Please prioritize this fix as it completely blocks a core feature of the application.
