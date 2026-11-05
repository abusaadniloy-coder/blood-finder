# BLOOD FINDER

*Emergency Blood Donor Finder System*

A web interface for finding the nearest eligible blood donor in Bangladesh, sending a donation proposal, arranging transport for the donor and recording the transport payment.

Group project for the **System Analysis and Design** course, Executive MBA (Department of Management Information Systems), University of Dhaka.

## What it does

The screens follow the processes in the Level-1 Data Flow Diagram.

| DFD process | Screen | What happens |
|---|---|---|
| 3.1 Nearest donor tracking | Find nearest donor | The seeker enters the blood group, district and area. Compatible donors are listed, ranked by readiness, then same area, then same district, then exact group match. |
| 3.2 Donor medical condition | Medical status, Find nearest donor | Each donor's latest health check is tested against the eligibility rules. Donors who fail are shown with the reason. |
| 4.1 Pickup method | Proposals and pickup | A proposal links a blood request to a donor and records the pickup method. The donor's acceptance or refusal is recorded. |
| 4.2 Transportation aid | Transportation | A ride is booked for an accepted donor. The fare is calculated from the vehicle type and distance. |
| 4.3 Payment for transportation | Payments | The seeker pays the fare by bKash, Nagad, Rocket, cash or card. |

District lists cover all 64 districts of Bangladesh, grouped under the 8 divisions.

Other screens: dashboard, blood requests, donor and seeker registration, and a database view of all seven tables with CSV download.

## Business rules

- **Blood compatibility:** a request for B+ accepts B+, B−, O+ and O− donors; AB+ accepts all groups; O− accepts only O−.
- **Donation gap:** a donor must wait at least 120 days after the last donation.
- **Medical eligibility:** haemoglobin of at least 12.5 g/dL, weight of at least 45 kg, a negative Hepatitis B screen and a health condition of "Fit".
- **Donor age:** 18 to 60 years at registration.
- **Mobile number:** must be a valid 11-digit Bangladeshi number (01XXXXXXXXX).
- **Transport fare:** base fare plus a rate per km.

| Vehicle | Base fare | Per km |
|---|---|---|
| CNG auto-rickshaw | Tk 60 | Tk 25 |
| Ride-share car | Tk 100 | Tk 38 |
| Ride-share motorbike | Tk 40 | Tk 18 |
| Ambulance | Tk 500 | Tk 45 |
| Private car | Tk 150 | Tk 35 |

## Data model

The app uses the seven relations of the relational model. Primary keys are marked PK and foreign keys FK.

- `BLOOD_SEEKER` (seeker_id PK, name, gender, phone, location, district, relation_to_patient, registration_date)
- `BLOOD_REQUEST` (request_id PK, seeker_id FK, patient_ref, blood_group, units_needed, component, hospital_name, hospital_district, reason, urgency, request_time, request_status)
- `DONOR` (donor_id PK, name, gender, date_of_birth, blood_group, phone, current_location, district, last_donation_date, total_donations, status, registration_date)
- `MEDICAL_STATUS` (status_id PK, donor_id FK, check_date, haemoglobin, weight, blood_pressure, hepatitis_B_screen, health_condition)
- `DONATION_PROPOSAL` (proposal_id PK, request_id FK, donor_id FK, proposal_time, pickup_method, proposal_status, response_time)
- `TRANSPORTATION` (transport_id PK, proposal_id FK unique, vehicle_type, pickup_point, drop_point, pickup_time, distance_km, trip_status)
- `PAYMENT` (payment_id PK, transport_id FK unique, seeker_id FK, amount, payment_method, transaction_ref, payment_time, payment_status)

Derived values (donor readiness, eligibility, days since last donation, fare) are calculated in the app rather than stored, which keeps the tables in third normal form.

## Sample data

`js/data.js` holds the sample database: 30 donors, 15 seekers, 20 requests, 36 medical checks, 28 proposals, 13 trips and 12 payments. Locations and hospitals are real places in Bangladesh. All names, phone numbers and transaction references are fictitious.

Changes made in the app are saved in the browser's local storage. **Database tables → Reset sample data** restores the original records.

## Running it

No installation or build step is needed. Open `index.html` in any modern browser, or publish the folder with GitHub Pages (**Settings → Pages → Deploy from branch → main / root**).

## Files

```
index.html      page shell and navigation
css/style.css   layout and styling (desktop and mobile)
js/data.js      sample database
js/app.js       screens, business rules and data handling
```
