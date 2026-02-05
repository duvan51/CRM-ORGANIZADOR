import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const uuid = "afd282cd-9813-48a2-ac05-3050a1f0e4c3";
const email = "usuario_secundario@vendedor.com"; // Email placeholder o informativo

async function makeSuperUser() {
    console.log(`Intentando asignar superuser a: ${email} (${uuid})`);

    // El error PGRST204 puede indicar que la tabla 'profiles' no es visible o el esquema está corrupto
    // Intentaremos primero verificar si la tabla es accesible
    const { data: checkData, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);

    if (checkError) {
        console.error("❌ ERROR DE CONEXIÓN/ESQUEMA:", checkError.message, checkError.code);
        if (checkError.code === 'PGRST116' || checkError.code === '406') {
            console.log("ℹ️ Esto es normal si la tabla está vacía o tiene RLS.");
        } else {
            return;
        }
    }

    console.log("Insertando registro...");
    const { data, error } = await supabase
        .from('profiles')
        .upsert({
            id: uuid,
            username: 'duvan_admin',
            full_name: 'Duvan Aponte',
            role: 'superuser',
            email: email
        })
        .select();

    if (error) {
        console.error("❌ Error final al asignar superuser:", error.message, error.details);
    } else {
        console.log("✅ Superuser asignado correctamente:", data);
    }
}

makeSuperUser();
