# Steel City Orders

Build a premium, modern web application called "Steel City Jersey".

This is a school sports jersey ordering portal. The application will use my existing Supabase project "Steel City Jersey" for the database and storage.

Create the application with a clean, premium sports-commerce experience that works beautifully on desktop and mobile.

Core purpose:

Students/players should be able to select their details, choose a jersey size and quantity, place an order, upload payment proof, and receive an order confirmation.

Use Supabase for all persistent data and file storage. Do not create a separate backend or mock database.

Existing Supabase database:

- players table

  - id

  - player_name

  - age_group

  - ground_name

  - created_at

- orders table

  - id

  - created_at

  - order_id

  - player_id

  - jersey_size

  - quantity

  - amount

  - payment_status

  - payment_method

  - payment_proof

- orders.player_id is a foreign key to players.id.

- Supabase Storage bucket:

  payment-proofs

Important:

Use the existing database structure. Do not rename existing columns or create duplicate tables unless absolutely required.

Build the initial version with:

1. Premium landing/order page

2. Player selection/details section

3. Jersey size selection

4. Quantity selection

5. Automatic order amount calculation

6. Order summary

7. Payment method selection

8. Payment proof upload to the Supabase "payment-proofs" bucket

9. Order submission to the Supabase orders table

10. Order confirmation screen with the generated order ID

11. Clean validation and error messages

12. Responsive mobile and desktop layouts

The design should feel like a premium professional sports club/school jersey ordering system, not a generic ecommerce template.

Use strong typography, spacious layouts, polished cards, subtle shadows, premium sports visuals, and clear calls to action.

Do not use fake/sample orders or fake database data in the final application.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/37518b83-a69e-4bac-8bf8-22f57f63e449).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
