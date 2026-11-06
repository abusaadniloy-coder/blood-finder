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
| 4.2 Transportation aid | Transportation, Registered vehicles | Drivers register their vehicles. For an accepted app-arranged ride, an available registered vehicle near the donor is booked. The fare is calculated from the vehicle type and distance. |
| 4.3 Payment for transportation | Booking form, Payments | As soon as a vehicle is chosen, the payment section appears: pay now by bKash, Nagad, Rocket or card (with transaction ID), or pay cash to the driver after the trip. A paid fare for a cancelled trip becomes a refund. |

District lists cover all 64 districts of Bangladesh, grouped under the 8 divisions. Choosing a district fills the next list with that district's upazilas only (494 in total). Metro districts (Dhaka, Chattogram, Khulna, Rajshahi and Gazipur) also list their main city corporation areas, such as Mirpur, Dhanmondi, Panchlaish and Boalia. Each blood request records the hospital's district and upazila. When donors are searched for a request, a donor in the hospital's own upazila is ranked first, then donors elsewhere in the same district.

**Hospital directory:** 596 hospitals across all 64 districts, each tied to its district and upazila. It includes 39 medical college hospitals, 16 specialised institutes, 65 district and general hospitals, 42 major private hospitals and the Upazila Health Complex of each of the 434 non-sadar upazilas. In the new blood request form, the hospital list opens with all 596 hospitals and the upazila list with every upazila, both grouped by district. Picking a hospital fills in its district and upazila; picking a district or upazila first narrows the hospital list and puts that upazila's hospitals first. A hospital can also be found by name from anywhere in the country. A hospital that is not listed can still be entered with "Other hospital". District hospitals without a well-known proper name are listed as "<District> District Sadar Hospital". The Hospitals page lets you browse and search the whole directory.

Other screens: dashboard, blood requests, donor and seeker registration, and a database view of all seven tables with CSV download.

## Business rules

- **Blood compatibility:** a request for B+ accepts B+, B−, O+ and O− donors; AB+ accepts all groups; O− accepts only O−.
- **Donation gap:** a donor must wait at least 120 days after the last donation.
- **Medical eligibility:** haemoglobin of at least 12.5 g/dL, weight of at least 45 kg, a negative Hepatitis B screen and a health condition of "Fit".
- **Donor age:** 18 to 60 years at registration.
- **Mobile number:** must be a valid 11-digit Bangladeshi number (01XXXXXXXXX).
- **Vehicle registration:** valid 01X mobile number, a number plate in the BRTA style (for example Dhaka Metro-Tha 11-2345 or Kushtia-La 12-3456), no duplicate plates, and a driving licence number.
- **Vehicle booking:** only active, available vehicles are offered, nearest to the donor first (same upazila, then same district, then other districts). A booked vehicle shows as On trip until the trip is completed or cancelled.
- **Transport fare:** base fare plus a rate per km.

| Vehicle | Base fare | Per km |
|---|---|---|
| CNG auto-rickshaw | Tk 60 | Tk 25 |
| Ride-share car | Tk 100 | Tk 38 |
| Ride-share motorbike | Tk 40 | Tk 18 |
| Ambulance | Tk 500 | Tk 45 |
| Private car | Tk 150 | Tk 35 |

## Data model

The app uses eight relations. `VEHICLE` was added for app-arranged rides: one vehicle makes many trips (1:M with `TRANSPORTATION`). Primary keys are marked PK and foreign keys FK.

- `BLOOD_SEEKER` (seeker_id PK, name, gender, phone, location, district, relation_to_patient, registration_date)
- `BLOOD_REQUEST` (request_id PK, seeker_id FK, patient_ref, blood_group, units_needed, component, hospital_name, hospital_district, hospital_upazila, reason, urgency, request_time, request_status)
- `DONOR` (donor_id PK, name, gender, date_of_birth, blood_group, phone, current_location, district, last_donation_date, total_donations, status, registration_date)
- `MEDICAL_STATUS` (status_id PK, donor_id FK, check_date, haemoglobin, weight, blood_pressure, hepatitis_B_screen, health_condition)
- `DONATION_PROPOSAL` (proposal_id PK, request_id FK, donor_id FK, proposal_time, pickup_method, proposal_status, response_time)
- `VEHICLE` (vehicle_id PK, driver_name, driver_phone, vehicle_type, registration_no unique, driving_licence_no, district, upazila, status, total_trips, registration_date)
- `TRANSPORTATION` (transport_id PK, proposal_id FK unique, vehicle_id FK, vehicle_type, pickup_point, drop_point, pickup_time, distance_km, trip_status)
- `PAYMENT` (payment_id PK, transport_id FK unique, seeker_id FK, amount, payment_method, transaction_ref, payment_time, payment_status)

Derived values (donor readiness, eligibility, days since last donation, fare) are calculated in the app rather than stored, which keeps the tables in third normal form.

## Sample data

`js/data.js` holds the sample database: 30 donors, 15 seekers, 20 requests, 36 medical checks, 28 proposals, 30 registered vehicles, 13 trips and 12 payments. Locations and hospitals are real places in Bangladesh. The upazila list is based on the open nuhil/bangladesh-geocode dataset (MIT licence), with spellings updated to current official forms. All names, phone numbers and transaction references are fictitious.

Changes made in the app are saved in the browser's local storage. **Database tables → Reset sample data** restores the original records.

## Phone app

BLOOD FINDER can be used as a phone app in two ways. Both work without internet once installed.

**Android APK (demo):** download [blood-finder.apk](https://github.com/abusaadniloy-coder/blood-finder/releases/latest/download/blood-finder.apk) on the phone, open it and tap Install. Allow "Install unknown apps" if Android asks, and choose "Install anyway" if Play Protect warns that the app is unrecognised (it is not on the Play Store). Needs Android 6.0 or newer.

**Install from the browser:** open the website in Chrome (Android) and choose ⋮ → Add to Home screen, or in Safari (iPhone) choose Share → Add to Home Screen. The **Install on phone** page in the app shows the same steps.

The APK is built automatically by GitHub Actions (`.github/workflows/android-apk.yml`) every time the site changes, using the Capacitor wrapper in `android-app/`, and published as the `demo-apk` release.

## Running it

No installation or build step is needed. Open `index.html` in any modern browser, or publish the folder with GitHub Pages (**Settings → Pages → Deploy from branch → main / root**).

## Files

```
index.html      page shell and navigation
css/style.css   layout and styling (desktop and mobile)
js/geo.js       districts, upazilas and city areas
js/hospitals.js hospital directory
js/data.js      sample database
js/app.js       screens, business rules and data handling
sw.js           offline cache for the installed app
manifest.webmanifest  app name, icon and colours
icons/          app icons
android-app/    Android (APK) wrapper, built by GitHub Actions
```
