import fs from 'fs';
import path from 'path';

function walkAndReplace(dir) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkAndReplace(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            // Replace admin email explicitly targeting strings
            if (content.includes('admin@amplodge.com')) {
                content = content.replace(/['"`]admin@amplodge\.com['"`]/g, "import.meta.env.VITE_ADMIN_EMAIL || 'admin@tenant.com'");
                content = content.replace(/admin@amplodge\.com/g, "admin@tenant.com");
                modified = true;
            }

            // Replace domains
            if (content.includes('amplodge.org') || content.includes('amplodge.com') || content.includes('amplodge.net')) {
                content = content.replace(/https?:\/\/www\.amplodge\.(org|com|net)/g, "https://tenantdomain.com");
                content = content.replace(/https?:\/\/amplodge\.(org|com|net)/g, "https://tenantdomain.com");
                content = content.replace(/amplodge\.(org|com|net)/g, "tenantdomain.com");
                modified = true;
            }

            // Replace generic email
            if (content.includes('info@amplodge') || content.includes('support@amplodge') || content.includes('tech@amplodge')) {
                content = content.replace(/(info|support|tech|bookings)@amplodge\.(org|com|net)/g, "$1@tenantdomain.com");
                modified = true;
            }

            // Replace phone numbers
            if (content.includes('+233 55 500 9697') || content.includes('0555009697')) {
                content = content.replace(/\+233 55 500 9697/g, "+1 000 000 0000");
                content = content.replace(/amplodge0555009697@gmail\.com/g, "hotel@tenantdomain.com");
                modified = true;
            }

            // Replace static AmpLodge title
            if (content.includes('AMP Lodge') || content.includes('AmpLodge')) {
                content = content.replace(/AMP Lodge/g, "Hotel SaaS");
                content = content.replace(/AmpLodge/g, "Hotel SaaS");
                modified = true;
            }

            if (modified) {
                fs.writeFileSync(fullPath, content);
                console.log('Cleaned: ' + fullPath);
            }
        }
    }
}

walkAndReplace('./src');
walkAndReplace('./netlify');
console.log('Cleanup complete.');
