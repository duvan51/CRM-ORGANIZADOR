import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const uuids = [
    "5fd2d493-6543-459a-bf23-15b3a3da2064",
    "afd282cd-9813-48a2-ac05-3050a1f0e4c3"
];

async function fixProfiles() {
    for (const uuid of uuids) {
        console.log(`\n--- Procesando UUID: ${uuid} ---`);

        // Intentamos insertar solo los campos básicos que sabemos que suelen existir
        // Omitimos 'email' ya que el error previo indicó que no existe en el esquema
        const { data, error } = await supabase
            .from('profiles')
            .upsert({
                id: uuid,
                username: 'admin_' + uuid.substring(0, 4),
                full_name: 'Admin User',
                role: 'superuser'
            })
            .select();

        if (error) {
            console.error(`❌ Error al insertar ${uuid}:`, error.message);
            console.log("Intentando sin 'full_name' por si acaso...");

            const { data: data2, error: error2 } = await supabase
                .from('profiles')
                .upsert({ id: uuid, role: 'superuser' })
                .select();

            if (error2) console.error("❌ Fallo total:", error2.message);
            else console.log("✅ Insertado con campos mínimos:", data2);
        } else {
            console.log("✅ Perfil creado/actualizado:", data);
        }
    }
}

fixProfiles();
